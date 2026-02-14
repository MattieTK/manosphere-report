import {
  WorkflowEntrypoint,
  WorkflowStep,
  WorkflowEvent,
} from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDb } from '~/db'
import { episodes, transcriptSegments, episodeAnalyses } from '~/db/schema'
import { groupWordsIntoSegments, type Word } from '~/lib/timestamp'
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  parseAnalysisResult,
} from '~/lib/analysis'

/** Efficiently convert a Uint8Array to base64 without per-byte string concatenation */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

type EpisodePayload = {
  episodeId: string
  podcastId: string
  audioUrl: string
}

export class EpisodeProcessingWorkflow extends WorkflowEntrypoint<
  Env,
  EpisodePayload
> {
  async run(event: WorkflowEvent<EpisodePayload>, step: WorkflowStep) {
    const { episodeId, podcastId, audioUrl } = event.payload

    // Step 1: Download audio to R2
    const r2Key = await step.do(
      'download-audio',
      {
        retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' },
        timeout: '10 minutes',
      },
      async () => {
        const db = getDb(this.env.DB)
        await db
          .update(episodes)
          .set({ status: 'downloading' })
          .where(eq(episodes.id, episodeId))

        const key = `podcasts/${podcastId}/episodes/${episodeId}.mp3`
        const response = await fetch(audioUrl)
        if (!response.ok)
          throw new Error(`Download failed: ${response.status}`)

        await this.env.AUDIO_BUCKET.put(key, response.body, {
          httpMetadata: { contentType: 'audio/mpeg' },
        })

        await db
          .update(episodes)
          .set({ r2Key: key })
          .where(eq(episodes.id, episodeId))

        return key
      },
    )

    // Step 2: Split audio into chunks and store in R2
    const chunkKeys = await step.do(
      'chunk-audio',
      { timeout: '5 minutes' },
      async () => {
        const object = await this.env.AUDIO_BUCKET.get(r2Key)
        if (!object) throw new Error('Audio not found in R2')

        const audioBuffer = await object.arrayBuffer()
        const CHUNK_SIZE = 1 * 1024 * 1024 // 1MB
        const chunks: string[] = []

        for (
          let offset = 0;
          offset < audioBuffer.byteLength;
          offset += CHUNK_SIZE
        ) {
          const chunk = audioBuffer.slice(
            offset,
            Math.min(offset + CHUNK_SIZE, audioBuffer.byteLength),
          )
          const chunkKey = `podcasts/${podcastId}/episodes/${episodeId}/chunk_${chunks.length}.mp3`
          await this.env.AUDIO_BUCKET.put(chunkKey, chunk)
          chunks.push(chunkKey)
        }

        return chunks
      },
    )

    // Step 3: Transcribe each chunk
    await step.do('update-status-transcribing', async () => {
      const db = getDb(this.env.DB)
      await db
        .update(episodes)
        .set({ status: 'transcribing' })
        .where(eq(episodes.id, episodeId))
    })

    const transcriptions: Array<{
      text: string
      words: Word[]
      duration: number
    }> = []
    let cumulativeOffset = 0

    for (let i = 0; i < chunkKeys.length; i++) {
      const result = await step.do(
        `transcribe-chunk-${i}`,
        {
          retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
          timeout: '2 minutes',
        },
        async () => {
          const chunkObj = await this.env.AUDIO_BUCKET.get(chunkKeys[i])
          if (!chunkObj) throw new Error(`Chunk ${i} not found`)

          const chunkBuffer = await chunkObj.arrayBuffer()
          const base64 = uint8ArrayToBase64(new Uint8Array(chunkBuffer))

          const whisperResult = (await this.env.AI.run(
            '@cf/openai/whisper-large-v3-turbo',
            {
              audio: base64,
              language: 'en',
            },
          )) as any

          // Words are nested inside segments, not at the response root
          const words: Array<{
            word: string
            start: number
            end: number
          }> = []
          if (Array.isArray(whisperResult.segments)) {
            for (const segment of whisperResult.segments) {
              if (Array.isArray(segment.words)) {
                words.push(...segment.words)
              }
            }
          }

          return {
            text: whisperResult.text || '',
            words,
            duration:
              whisperResult.transcription_info?.duration || 30,
          }
        },
      )

      // Offset word timestamps by cumulative duration
      const offsetWords: Word[] = result.words.map((w: any) => ({
        word: w.word,
        start: w.start + cumulativeOffset,
        end: w.end + cumulativeOffset,
      }))

      transcriptions.push({
        text: result.text,
        words: offsetWords,
        duration: result.duration,
      })
      cumulativeOffset += result.duration
    }

    // Step 4: Merge transcript and store segments in D1
    const fullTranscript = await step.do(
      'store-transcript',
      { timeout: '2 minutes' },
      async () => {
        const allWords = transcriptions.flatMap((t) => t.words)
        const fullText = transcriptions.map((t) => t.text).join(' ')

        let segments: Array<{
          text: string
          startTime: number
          endTime: number
          words: Word[]
        }>

        if (allWords.length > 0) {
          // Primary path: group word-level timestamps into segments
          segments = groupWordsIntoSegments(allWords, 15)
        } else {
          // Fallback: create segments from chunk text with estimated timing
          // This handles cases where Whisper doesn't return word timestamps
          let timeOffset = 0
          segments = []
          for (const t of transcriptions) {
            if (!t.text.trim()) continue
            // Split chunk text into sentences
            const sentences = t.text
              .split(/(?<=[.!?])\s+/)
              .filter((s) => s.trim())
            const sentenceDuration =
              sentences.length > 0 ? t.duration / sentences.length : t.duration
            for (const sentence of sentences) {
              segments.push({
                text: sentence.trim(),
                startTime: timeOffset,
                endTime: timeOffset + sentenceDuration,
                words: [],
              })
              timeOffset += sentenceDuration
            }
          }
        }

        const db = getDb(this.env.DB)

        // Batch insert segments
        for (let i = 0; i < segments.length; i++) {
          await db.insert(transcriptSegments).values({
            id: nanoid(),
            episodeId,
            segmentIndex: i,
            text: segments[i].text,
            startTime: segments[i].startTime,
            endTime: segments[i].endTime,
            words: JSON.stringify(segments[i].words),
          })
        }

        // Update episode duration
        await db
          .update(episodes)
          .set({ durationSeconds: Math.round(cumulativeOffset) })
          .where(eq(episodes.id, episodeId))

        return fullText
      },
    )

    // Step 5: Analyze transcript with GLM-4.7-Flash
    await step.do('update-status-analyzing', async () => {
      const db = getDb(this.env.DB)
      await db
        .update(episodes)
        .set({ status: 'analyzing' })
        .where(eq(episodes.id, episodeId))
    })

    const analysis = await step.do(
      'analyze-transcript',
      {
        retries: { limit: 2, delay: '15 seconds', backoff: 'exponential' },
        timeout: '3 minutes',
      },
      async () => {
        const prompt = buildAnalysisPrompt(fullTranscript)
        const result = (await this.env.AI.run(
          '@cf/zai-org/glm-4.7-flash' as any,
          {
            messages: [
              { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          },
        )) as any

        return parseAnalysisResult(result.response || '')
      },
    )

    // Step 6: Store analysis in D1
    await step.do('store-analysis', async () => {
      const db = getDb(this.env.DB)
      await db.insert(episodeAnalyses).values({
        id: nanoid(),
        episodeId,
        summary: analysis.summary,
        tags: JSON.stringify(analysis.tags),
        themes: JSON.stringify(analysis.themes),
        sentiment: analysis.sentiment,
        keyQuotes: JSON.stringify(analysis.keyQuotes),
        createdAt: new Date(),
      })

      await db
        .update(episodes)
        .set({ status: 'complete' })
        .where(eq(episodes.id, episodeId))
    })

    // Step 7: Clean up temporary chunk files from R2
    await step.do('cleanup-chunks', async () => {
      for (const chunkKey of chunkKeys) {
        await this.env.AUDIO_BUCKET.delete(chunkKey)
      }
    })
  }
}
