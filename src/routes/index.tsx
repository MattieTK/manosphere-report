import { createFileRoute, Link } from '@tanstack/react-router'
import { getHomepageData, generateWeeklyAnalysis } from '~/lib/server-fns'
import { useState } from 'react'
import Markdown from 'react-markdown'

export const Route = createFileRoute('/')({
  loader: () => getHomepageData(),
  component: HomePage,
})

function HomePage() {
  const { podcasts, weeklyAnalysis } = Route.useLoaderData()
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false)

  const handleGenerateAnalysis = async () => {
    setGeneratingAnalysis(true)
    try {
      await generateWeeklyAnalysis()
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to generate analysis')
    } finally {
      setGeneratingAnalysis(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-10">
        <h1 className="font-heading text-4xl mb-2">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Tracking {podcasts.length} podcast{podcasts.length !== 1 ? 's' : ''} across
          the manosphere ecosystem.
        </p>
      </div>

      {/* Podcast Grid */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Tracked Podcasts
          </span>
          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 text-xs font-mono font-medium px-1.5">
            {podcasts.length}
          </span>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
          <Link
            to="/admin"
            className="text-xs font-mono uppercase tracking-wider text-ink-500 dark:text-ink-300 hover:text-ink-700 dark:hover:text-ink-200 transition-colors"
          >
            Manage
          </Link>
        </div>

        {podcasts.length === 0 ? (
          <div className="podcast-card p-8 text-center text-gray-500 dark:text-gray-400">
            <p className="mb-4">No podcasts are being tracked yet.</p>
            <Link
              to="/admin"
              className="btn btn-primary"
            >
              Add Your First Podcast
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {podcasts.map((podcast) => (
              <Link
                key={podcast.id}
                to="/podcasts/$podcastId"
                params={{ podcastId: podcast.id }}
                className="podcast-card p-4 block"
              >
                <div className="flex gap-3">
                  {podcast.imageUrl && (
                    <img
                      src={podcast.imageUrl}
                      alt={podcast.title}
                      className="w-16 h-16 rounded-md object-cover flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <h3 className="font-heading text-lg truncate">{podcast.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono text-xs">
                      {podcast.episodeCount} episode
                      {podcast.episodeCount !== 1 ? 's' : ''}
                    </p>
                    {podcast.latestEpisode && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
                        Latest: {podcast.latestEpisode.title}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Weekly Trend Analysis */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Weekly Trend Analysis
          </span>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
          <button
            onClick={handleGenerateAnalysis}
            disabled={generatingAnalysis}
            className="btn btn-sm btn-secondary"
          >
            {generatingAnalysis ? 'Generating\u2026' : 'Generate New'}
          </button>
        </div>

        {weeklyAnalysis ? (
          <div className="podcast-card p-6">
            <div className="flex items-center gap-2 text-xs font-mono text-gray-500 dark:text-gray-400 mb-4">
              <span>
                {new Date(weeklyAnalysis.weekStart).toLocaleDateString()} &ndash;{' '}
                {new Date(weeklyAnalysis.weekEnd).toLocaleDateString()}
              </span>
            </div>

            {/* Trending Topics */}
            {weeklyAnalysis.trendingTopics && (
              <div className="mb-5">
                <p className="sidebar-label">Trending Topics</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    JSON.parse(weeklyAnalysis.trendingTopics) as string[]
                  ).map((topic: string, i: number) => (
                    <span key={i} className="topic-tag">
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Analysis Text */}
            <div className="prose dark:prose-invert max-w-none text-sm">
              <Markdown>{weeklyAnalysis.analysis}</Markdown>
            </div>
          </div>
        ) : (
          <div className="podcast-card p-8 text-center text-gray-500 dark:text-gray-400">
            <p>
              No weekly analysis available yet. Click "Generate New" to
              create one from the past week's episodes.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
