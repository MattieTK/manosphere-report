import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { eq, desc, and, gte, lte, sql, count } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDb } from '~/db'
import {
  podcasts,
  episodes,
  transcriptSegments,
  episodeAnalyses,
  weeklyAnalyses,
} from '~/db/schema'
import { parseFeed, pollAllFeeds, resolveToFeedUrl } from '~/lib/rss'
import {
  WEEKLY_ANALYSIS_SYSTEM_PROMPT,
  buildWeeklyAnalysisPrompt,
  parseWeeklyAnalysis,
  type WeeklyAnalysisInput,
} from '~/lib/analysis'

// ==================== Podcast Functions ====================

export const getHomepageData = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = getDb(env.DB)

    const allPodcasts = await db
      .select()
      .from(podcasts)
      .where(eq(podcasts.active, true))
      .orderBy(desc(podcasts.addedAt))

    // Get episode counts per podcast
    const podcastsWithCounts = await Promise.all(
      allPodcasts.map(async (podcast) => {
        const [episodeCount] = await db
          .select({ count: count() })
          .from(episodes)
          .where(eq(episodes.podcastId, podcast.id))

        const [latestEpisode] = await db
          .select({ title: episodes.title, publishedAt: episodes.publishedAt })
          .from(episodes)
          .where(eq(episodes.podcastId, podcast.id))
          .orderBy(desc(episodes.publishedAt))
          .limit(1)

        return {
          ...podcast,
          episodeCount: episodeCount?.count ?? 0,
          latestEpisode: latestEpisode || null,
        }
      }),
    )

    // Get latest weekly analysis
    const [latestAnalysis] = await db
      .select()
      .from(weeklyAnalyses)
      .orderBy(desc(weeklyAnalyses.weekEnd))
      .limit(1)

    return {
      podcasts: podcastsWithCounts,
      weeklyAnalysis: latestAnalysis || null,
    }
  },
)

export const getPodcastDetail = createServerFn({ method: 'GET' })
  .inputValidator((input: { podcastId: string }) => input)
  .handler(async ({ data }) => {
    const db = getDb(env.DB)

    const [podcast] = await db
      .select()
      .from(podcasts)
      .where(eq(podcasts.id, data.podcastId))
      .limit(1)

    if (!podcast) throw new Error('Podcast not found')

    const episodeList = await db
      .select()
      .from(episodes)
      .where(eq(episodes.podcastId, data.podcastId))
      .orderBy(desc(episodes.publishedAt))

    return { podcast, episodes: episodeList }
  })

export const getEpisodeDetail = createServerFn({ method: 'GET' })
  .inputValidator((input: { episodeId: string }) => input)
  .handler(async ({ data }) => {
    const db = getDb(env.DB)

    const [episode] = await db
      .select()
      .from(episodes)
      .where(eq(episodes.id, data.episodeId))
      .limit(1)

    if (!episode) throw new Error('Episode not found')

    const [podcast] = await db
      .select()
      .from(podcasts)
      .where(eq(podcasts.id, episode.podcastId))
      .limit(1)

    const segments = await db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.episodeId, data.episodeId))
      .orderBy(transcriptSegments.segmentIndex)

    const [analysis] = await db
      .select()
      .from(episodeAnalyses)
      .where(eq(episodeAnalyses.episodeId, data.episodeId))
      .limit(1)

    return { episode, podcast, segments, analysis: analysis || null }
  })

// ==================== Admin Functions ====================

export const addPodcast = createServerFn({ method: 'POST' })
  .inputValidator((input: { feedUrl: string }) => input)
  .handler(async ({ data }) => {
    // Resolve Apple Podcasts / iTunes links to RSS feed URLs
    const feedUrl = await resolveToFeedUrl(data.feedUrl)
    const feed = await parseFeed(feedUrl)

    const db = getDb(env.DB)
    const id = nanoid()

    await db.insert(podcasts).values({
      id,
      title: feed.title,
      feedUrl,
      imageUrl: feed.imageUrl || null,
      description: feed.description || null,
      addedAt: new Date(),
      active: true,
    })

    return { id, title: feed.title, episodeCount: feed.items.length }
  })

export const removePodcast = createServerFn({ method: 'POST' })
  .inputValidator((input: { podcastId: string }) => input)
  .handler(async ({ data }) => {
    const db = getDb(env.DB)

    // Get all episodes for this podcast
    const podcastEpisodes = await db
      .select({ id: episodes.id, r2Key: episodes.r2Key })
      .from(episodes)
      .where(eq(episodes.podcastId, data.podcastId))

    // Delete R2 files for each episode
    for (const episode of podcastEpisodes) {
      if (episode.r2Key) {
        try {
          await (env as any).AUDIO_BUCKET.delete(episode.r2Key)
        } catch {
          // File may not exist, continue anyway
        }
      }
    }

    // Delete related records (order matters due to foreign keys)
    const episodeIds = podcastEpisodes.map((e) => e.id)

    if (episodeIds.length > 0) {
      // Delete transcript segments
      await db
        .delete(transcriptSegments)
        .where(sql`${transcriptSegments.episodeId} IN (${sql.join(episodeIds.map(id => sql`${id}`), sql`, `)})`)

      // Delete episode analyses
      await db
        .delete(episodeAnalyses)
        .where(sql`${episodeAnalyses.episodeId} IN (${sql.join(episodeIds.map(id => sql`${id}`), sql`, `)})`)

      // Delete episodes
      await db.delete(episodes).where(eq(episodes.podcastId, data.podcastId))
    }

    // Delete the podcast
    await db.delete(podcasts).where(eq(podcasts.id, data.podcastId))

    return { success: true, deletedEpisodes: episodeIds.length }
  })

export const togglePodcast = createServerFn({ method: 'POST' })
  .inputValidator((input: { podcastId: string; active: boolean }) => input)
  .handler(async ({ data }) => {
    const db = getDb(env.DB)
    await db
      .update(podcasts)
      .set({ active: data.active })
      .where(eq(podcasts.id, data.podcastId))
    return { success: true }
  })

export const triggerPoll = createServerFn({ method: 'POST' }).handler(
  async () => {
    await pollAllFeeds(env as any)
    return { success: true }
  },
)

export const cancelAllJobs = createServerFn({ method: 'POST' }).handler(
  async () => {
    const db = getDb(env.DB)

    // Find all episodes that are currently processing
    const inProgressStatuses = ['downloading', 'transcribing', 'analyzing']
    const inProgressEpisodes = await db
      .select({ id: episodes.id, workflowId: episodes.workflowId })
      .from(episodes)
      .where(sql`${episodes.status} IN ('downloading', 'transcribing', 'analyzing')`)

    let cancelledCount = 0

    for (const episode of inProgressEpisodes) {
      // Attempt to cancel the workflow if it exists
      if (episode.workflowId) {
        try {
          const instance = await (env as any).EPISODE_WORKFLOW.get(episode.workflowId)
          await instance.abort()
        } catch {
          // Workflow may already be completed or not exist
        }
      }

      // Reset to pending
      await db
        .update(episodes)
        .set({ status: 'pending', workflowId: null, errorMessage: null })
        .where(eq(episodes.id, episode.id))

      cancelledCount++
    }

    return { cancelledCount }
  },
)

export const resetEpisode = createServerFn({ method: 'POST' })
  .inputValidator((input: { episodeId: string }) => input)
  .handler(async ({ data }) => {
    const db = getDb(env.DB)

    // Delete existing transcript segments
    await db
      .delete(transcriptSegments)
      .where(eq(transcriptSegments.episodeId, data.episodeId))

    // Delete existing analysis
    await db
      .delete(episodeAnalyses)
      .where(eq(episodeAnalyses.episodeId, data.episodeId))

    // Reset episode status
    await db
      .update(episodes)
      .set({ status: 'pending', workflowId: null, errorMessage: null })
      .where(eq(episodes.id, data.episodeId))

    return { success: true }
  })

export const processEpisode = createServerFn({ method: 'POST' })
  .inputValidator(
    (input: { episodeId: string; podcastId: string; audioUrl: string }) =>
      input,
  )
  .handler(async ({ data }) => {
    const instance = await (env as any).EPISODE_WORKFLOW.create({
      params: {
        episodeId: data.episodeId,
        podcastId: data.podcastId,
        audioUrl: data.audioUrl,
      },
    })

    const db = getDb(env.DB)
    await db
      .update(episodes)
      .set({ workflowId: instance.id, status: 'downloading' })
      .where(eq(episodes.id, data.episodeId))

    return { workflowId: instance.id }
  })

export const importPastEpisodes = createServerFn({ method: 'POST' })
  .inputValidator((input: { podcastId: string }) => input)
  .handler(async ({ data }) => {
    const db = getDb(env.DB)

    const [podcast] = await db
      .select()
      .from(podcasts)
      .where(eq(podcasts.id, data.podcastId))
      .limit(1)

    if (!podcast) throw new Error('Podcast not found')

    const feed = await parseFeed(podcast.feedUrl)
    let importedCount = 0

    // Sort by publish date descending and limit to most recent 5 episodes
    const sortedItems = [...feed.items]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 5)

    for (const item of sortedItems) {
      // Only import episodes published BEFORE the podcast was added
      if (item.publishedAt >= podcast.addedAt) continue

      // Check if already exists
      const existing = await db
        .select({ id: episodes.id })
        .from(episodes)
        .where(
          and(
            eq(episodes.podcastId, podcast.id),
            eq(episodes.guid, item.guid),
          ),
        )
        .limit(1)

      if (existing.length > 0) continue

      const episodeId = nanoid()
      await db.insert(episodes).values({
        id: episodeId,
        podcastId: podcast.id,
        title: item.title,
        guid: item.guid,
        audioUrl: item.audioUrl,
        publishedAt: item.publishedAt,
        status: 'pending',
        createdAt: new Date(),
      })
      importedCount++
    }

    return { importedCount }
  })

export const getAdminData = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = getDb(env.DB)

    const allPodcasts = await db
      .select()
      .from(podcasts)
      .orderBy(desc(podcasts.addedAt))

    const podcastsWithEpisodes = await Promise.all(
      allPodcasts.map(async (podcast) => {
        const episodeList = await db
          .select()
          .from(episodes)
          .where(eq(episodes.podcastId, podcast.id))
          .orderBy(desc(episodes.publishedAt))

        return { ...podcast, episodes: episodeList }
      }),
    )

    return { podcasts: podcastsWithEpisodes }
  },
)

// ==================== Weekly Analysis ====================

export const generateWeeklyAnalysis = createServerFn({
  method: 'POST',
}).handler(async () => {
  const db = getDb(env.DB)
  const weekEnd = new Date()
  const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Get all completed episode analyses from the past week
  const recentAnalyses = await db
    .select({
      episodeId: episodes.id,
      episodeTitle: episodes.title,
      podcastId: episodes.podcastId,
      summary: episodeAnalyses.summary,
      tags: episodeAnalyses.tags,
      themes: episodeAnalyses.themes,
    })
    .from(episodeAnalyses)
    .innerJoin(episodes, eq(episodes.id, episodeAnalyses.episodeId))
    .where(
      and(
        gte(episodes.publishedAt, weekStart),
        lte(episodes.publishedAt, weekEnd),
        eq(episodes.status, 'complete'),
      ),
    )

  if (recentAnalyses.length === 0) {
    throw new Error('No completed episodes in the past week to analyze')
  }

  // Get podcast titles
  const podcastMap = new Map<string, string>()
  const allPodcasts = await db.select().from(podcasts)
  for (const p of allPodcasts) {
    podcastMap.set(p.id, p.title)
  }

  const inputs: WeeklyAnalysisInput[] = recentAnalyses.map((r) => ({
    podcastTitle: podcastMap.get(r.podcastId) || 'Unknown',
    episodeTitle: r.episodeTitle,
    summary: r.summary,
    tags: JSON.parse(r.tags),
    themes: JSON.parse(r.themes),
  }))

  const prompt = buildWeeklyAnalysisPrompt(inputs)

  const result = (await (env as any).AI.run('@cf/zai-org/glm-4.7-flash', {
    messages: [
      { role: 'system', content: WEEKLY_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  })) as any

  const { analysis, trendingTopics } = parseWeeklyAnalysis(
    result.response || '',
  )

  const id = nanoid()
  await db.insert(weeklyAnalyses).values({
    id,
    weekStart,
    weekEnd,
    analysis,
    trendingTopics: JSON.stringify(trendingTopics),
    episodeIds: JSON.stringify(recentAnalyses.map((r) => r.episodeId)),
    createdAt: new Date(),
  })

  return {
    id,
    analysis,
    trendingTopics,
    episodeCount: recentAnalyses.length,
  }
})
