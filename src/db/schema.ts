import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const podcasts = sqliteTable('podcasts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  feedUrl: text('feed_url').notNull().unique(),
  imageUrl: text('image_url'),
  description: text('description'),
  addedAt: integer('added_at', { mode: 'timestamp' }).notNull(),
  lastPolledAt: integer('last_polled_at', { mode: 'timestamp' }),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    podcastId: text('podcast_id')
      .notNull()
      .references(() => podcasts.id),
    title: text('title').notNull(),
    guid: text('guid').notNull(),
    audioUrl: text('audio_url').notNull(),
    r2Key: text('r2_key'),
    publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
    durationSeconds: integer('duration_seconds'),
    status: text('status').notNull().default('pending'),
    workflowId: text('workflow_id'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_episodes_podcast_id').on(table.podcastId),
    index('idx_episodes_guid').on(table.guid),
    index('idx_episodes_status').on(table.status),
  ],
)

export const transcriptSegments = sqliteTable(
  'transcript_segments',
  {
    id: text('id').primaryKey(),
    episodeId: text('episode_id')
      .notNull()
      .references(() => episodes.id),
    segmentIndex: integer('segment_index').notNull(),
    text: text('text').notNull(),
    startTime: real('start_time').notNull(),
    endTime: real('end_time').notNull(),
    words: text('words').notNull(), // JSON: [{word, start, end}]
  },
  (table) => [
    index('idx_transcript_segments_episode').on(
      table.episodeId,
      table.segmentIndex,
    ),
  ],
)

export const episodeAnalyses = sqliteTable('episode_analyses', {
  id: text('id').primaryKey(),
  episodeId: text('episode_id')
    .notNull()
    .references(() => episodes.id)
    .unique(),
  summary: text('summary').notNull(),
  tags: text('tags').notNull(), // JSON array of strings
  themes: text('themes').notNull(), // JSON array of {theme, description}
  sentiment: text('sentiment'),
  keyQuotes: text('key_quotes'), // JSON array of notable quotes
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const weeklyAnalyses = sqliteTable(
  'weekly_analyses',
  {
    id: text('id').primaryKey(),
    weekStart: integer('week_start', { mode: 'timestamp' }).notNull(),
    weekEnd: integer('week_end', { mode: 'timestamp' }).notNull(),
    analysis: text('analysis').notNull(),
    trendingTopics: text('trending_topics').notNull(), // JSON array
    episodeIds: text('episode_ids').notNull(), // JSON array of episode IDs
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('idx_weekly_analyses_week_end').on(table.weekEnd)],
)
