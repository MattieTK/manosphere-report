import { createFileRoute, Link } from '@tanstack/react-router'
import { getHomepageData, generateWeeklyAnalysis } from '~/lib/server-fns'
import { useState } from 'react'

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
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Tracking {podcasts.length} podcast{podcasts.length !== 1 ? 's' : ''} across
          the manosphere ecosystem.
        </p>
      </div>

      {/* Podcast Grid */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Tracked Podcasts</h2>
          <Link
            to="/admin"
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Manage Podcasts
          </Link>
        </div>

        {podcasts.length === 0 ? (
          <div className="border rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
            <p className="mb-4">No podcasts are being tracked yet.</p>
            <Link
              to="/admin"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
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
                className="border rounded-lg p-4 hover:border-blue-400 dark:hover:border-blue-600 transition-colors bg-white dark:bg-gray-900"
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
                    <h3 className="font-semibold truncate">{podcast.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Weekly Trend Analysis</h2>
          <button
            onClick={handleGenerateAnalysis}
            disabled={generatingAnalysis}
            className="text-sm font-medium px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingAnalysis ? 'Generating...' : 'Generate New Analysis'}
          </button>
        </div>

        {weeklyAnalysis ? (
          <div className="border rounded-lg p-6 bg-white dark:bg-gray-900">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
              <span>
                {new Date(weeklyAnalysis.weekStart).toLocaleDateString()} &ndash;{' '}
                {new Date(weeklyAnalysis.weekEnd).toLocaleDateString()}
              </span>
            </div>

            {/* Trending Topics */}
            {weeklyAnalysis.trendingTopics && (
              <div className="mb-4">
                <h3 className="text-sm font-medium mb-2">Trending Topics</h3>
                <div className="flex flex-wrap gap-2">
                  {(
                    JSON.parse(weeklyAnalysis.trendingTopics) as string[]
                  ).map((topic: string, i: number) => (
                    <span
                      key={i}
                      className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Analysis Text */}
            <div className="prose dark:prose-invert max-w-none text-sm">
              {weeklyAnalysis.analysis.split('\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="border rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
            <p>
              No weekly analysis available yet. Click "Generate New Analysis" to
              create one from the past week's episodes.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
