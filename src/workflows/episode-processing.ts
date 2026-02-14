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

    // Step 2: Transcribe audio
    await step.do('update-status-transcribing', async () => {
      const db = getDb(this.env.DB)
      await db
        .update(episodes)
        .set({ status: 'transcribing' })
        .where(eq(episodes.id, episodeId))
    })

    const transcription = await step.do(
      'transcribe-audio',
      {
        retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' },
        timeout: '30 minutes',
      },
      async () => {
        const audioObj = await this.env.AUDIO_BUCKET.get(r2Key)
        if (!audioObj) throw new Error('Audio not found in R2')

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

        const text = whisperResult.text || ''
        const words: Word[] = ((whisperResult as any).words || []).map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        }))
        const duration = (whisperResult as any).transcription_info?.duration || 0

        if (!text.trim()) {
          throw new Error('Transcription returned empty result')
        }

        return { text, words, duration }
      },
    )

    // Step 3: Store transcript segments in D1
    const fullTranscript = await step.do(
      'store-transcript',
      { timeout: '2 minutes' },
      async () => {
        const segments = groupWordsIntoSegments(transcription.words, 15)

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
          .set({ durationSeconds: Math.round(transcription.duration) })
          .where(eq(episodes.id, episodeId))

        return transcription.text
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
