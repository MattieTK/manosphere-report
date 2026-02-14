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

    // Step 1: Download audio to R2 (skip if already exists)
    const r2Key = await step.do(
      'download-audio',
      {
        retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' },
        timeout: '10 minutes',
      },
      async () => {
        const db = getDb(this.env.DB)
        const key = `podcasts/${podcastId}/episodes/${episodeId}.mp3`

        // Check if file already exists in R2
        const existing = await this.env.AUDIO_BUCKET.head(key)
        if (existing) {
          // File exists, just update the r2Key reference
          await db
            .update(episodes)
            .set({ r2Key: key })
            .where(eq(episodes.id, episodeId))
          return key
        }

        await db
          .update(episodes)
          .set({ status: 'downloading' })
          .where(eq(episodes.id, episodeId))

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

    // Step 2: Get audio file size and calculate chunks
    await step.do('update-status-transcribing', async () => {
      const db = getDb(this.env.DB)
      await db
        .update(episodes)
        .set({ status: 'transcribing' })
        .where(eq(episodes.id, episodeId))
    })

    const audioMeta = await step.do('get-audio-metadata', async () => {
      const audioObj = await this.env.AUDIO_BUCKET.head(r2Key)
      if (!audioObj) throw new Error('Audio not found in R2')
      return { size: audioObj.size }
    })

    // Process in 10MB chunks to stay within 128MB memory limit
    const CHUNK_SIZE = 10 * 1024 * 1024
    const numChunks = Math.ceil(audioMeta.size / CHUNK_SIZE)

    const transcriptions: Array<{ text: string; words: Word[]; duration: number }> = []
    let cumulativeOffset = 0

    for (let i = 0; i < numChunks; i++) {
      const chunkResult = await step.do(
        `transcribe-chunk-${i}`,
        {
          retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' },
          timeout: '5 minutes',
        },
        async () => {
          const start = i * CHUNK_SIZE
          const end = Math.min(start + CHUNK_SIZE - 1, audioMeta.size - 1)

          const audioObj = await this.env.AUDIO_BUCKET.get(r2Key, {
            range: { offset: start, length: end - start + 1 },
          })
          if (!audioObj) throw new Error(`Chunk ${i} not found in R2`)

          const audioBuffer = await audioObj.arrayBuffer()
          const bytes = new Uint8Array(audioBuffer)
          let binary = ''
          for (let j = 0; j < bytes.length; j++) {
            binary += String.fromCharCode(bytes[j])
          }
          const base64 = btoa(binary)

          const whisperResult = await this.env.AI.run(
            '@cf/openai/whisper-large-v3-turbo',
            {
              audio: base64,
              language: 'en',
            },
          )

          return {
            text: whisperResult.text || '',
            words: (whisperResult as any).words || [],
            duration: (whisperResult as any).transcription_info?.duration || 0,
          }
        },
      )

      // Offset word timestamps by cumulative duration
      const offsetWords: Word[] = chunkResult.words.map((w: any) => ({
        word: w.word,
        start: w.start + cumulativeOffset,
        end: w.end + cumulativeOffset,
      }))

      transcriptions.push({
        text: chunkResult.text,
        words: offsetWords,
        duration: chunkResult.duration,
      })
      cumulativeOffset += chunkResult.duration
    }

    // Merge all transcriptions
    const allWords = transcriptions.flatMap((t) => t.words)
    const fullText = transcriptions.map((t) => t.text).join(' ')

    if (!fullText.trim()) {
      throw new Error('Transcription returned empty result')
    }

    // Step 3: Store transcript segments in D1
    const fullTranscript = await step.do(
      'store-transcript',
      { timeout: '2 minutes' },
      async () => {
        const segments = groupWordsIntoSegments(allWords, 15)

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

    // Step 4: Analyze transcript with GLM-4.7-Flash
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
        timeout: '5 minutes',
      },
      async () => {
        if (!fullTranscript || fullTranscript.length < 100) {
          throw new Error(`Transcript too short for analysis: ${fullTranscript?.length || 0} chars`)
        }

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

        // Handle different response formats from Workers AI
        const responseText = result.response || result.content || result.text || ''

        if (!responseText) {
          throw new Error(`Empty response from GLM model. Result keys: ${Object.keys(result).join(', ')}`)
        }

        return parseAnalysisResult(responseText)
      },
    )

    // Step 5: Store analysis in D1
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
  }
}
