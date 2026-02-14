import { XMLParser } from 'fast-xml-parser'
import { nanoid } from 'nanoid'
import { eq, and } from 'drizzle-orm'
import { getDb } from '~/db'
import { podcasts, episodes } from '~/db/schema'

interface FeedItem {
  title: string
  guid: string
  audioUrl: string
  publishedAt: Date
  description?: string
}

interface FeedMeta {
  title: string
  description?: string
  imageUrl?: string
  items: FeedItem[]
}

export async function parseFeed(feedUrl: string): Promise<FeedMeta> {
  const response = await fetch(feedUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`)
  }
  const xml = await response.text()

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  })
  const result = parser.parse(xml)

  const channel = result.rss?.channel || result.feed
  if (!channel) {
    throw new Error('Invalid RSS feed: no channel found')
  }

  const items: FeedItem[] = []
  const rawItems = Array.isArray(channel.item)
    ? channel.item
    : channel.item
      ? [channel.item]
      : []

  for (const item of rawItems) {
    const enclosure = item.enclosure
    const audioUrl = enclosure?.['@_url']
    if (!audioUrl) continue // Skip items without audio

    const guid =
      typeof item.guid === 'object' ? item.guid['#text'] : item.guid || audioUrl
    const pubDate = item.pubDate || item.published

    items.push({
      title: item.title || 'Untitled',
      guid: String(guid),
      audioUrl,
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
      description: item.description || item.summary,
    })
  }

  // Extract podcast image
  const itunesImage = channel['itunes:image']?.['@_href']
  const channelImage = channel.image?.url

  return {
    title: channel.title || 'Unknown Podcast',
    description: channel.description || channel.subtitle,
    imageUrl: itunesImage || channelImage,
    items,
  }
}

export async function pollAllFeeds(env: Env): Promise<void> {
  const db = getDb(env.DB)

  const activePodcasts = await db
    .select()
    .from(podcasts)
    .where(eq(podcasts.active, true))

  for (const podcast of activePodcasts) {
    try {
      const feed = await parseFeed(podcast.feedUrl)

      for (const item of feed.items) {
        // Skip episodes published before the podcast was added
        if (item.publishedAt < podcast.addedAt) continue

        // Check if episode already exists (by guid)
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

        // Insert new episode record
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

        // Trigger the processing workflow
        const instance = await env.EPISODE_WORKFLOW.create({
          params: {
            episodeId,
            podcastId: podcast.id,
            audioUrl: item.audioUrl,
          },
        })

        // Store workflow instance ID
        await db
          .update(episodes)
          .set({ workflowId: instance.id, status: 'downloading' })
          .where(eq(episodes.id, episodeId))
      }

      // Update last polled timestamp
      await db
        .update(podcasts)
        .set({ lastPolledAt: new Date() })
        .where(eq(podcasts.id, podcast.id))
    } catch (error) {
      console.error(`Error polling feed ${podcast.feedUrl}:`, error)
    }
  }
}
