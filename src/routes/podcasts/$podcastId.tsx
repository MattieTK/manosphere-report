import { createFileRoute, Link } from '@tanstack/react-router'
import { getPodcastDetail } from '~/lib/server-fns'

export const Route = createFileRoute('/podcasts/$podcastId')({
  loader: ({ params }) =>
    getPodcastDetail({ data: { podcastId: params.podcastId } }),
  component: PodcastDetailPage,
})

function PodcastDetailPage() {
  const { podcast, episodes } = Route.useLoaderData()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm font-mono">
        <Link to="/" className="text-ink-500 dark:text-ink-300 hover:text-ink-700 dark:hover:text-ink-200 transition-colors">
          Home
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-600 dark:text-gray-400">{podcast.title}</span>
      </nav>

      {/* Podcast Header */}
      <div className="flex gap-6 mb-10">
        {podcast.imageUrl && (
          <img
            src={podcast.imageUrl}
            alt={podcast.title}
            className="w-32 h-32 rounded-lg object-cover flex-shrink-0 shadow-sm"
          />
        )}
        <div>
          <h1 className="font-heading text-3xl mb-2">{podcast.title}</h1>
          {podcast.description && (
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-3">
              {podcast.description}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-mono text-gray-400 dark:text-gray-500 truncate max-w-lg">
              {podcast.feedUrl}
            </p>
            <p className="text-xs font-mono text-gray-400 dark:text-gray-500">
              Tracking since{' '}
              {new Date(podcast.addedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Episodes */}
      <div className="flex items-center gap-3 mb-5">
        <span className="font-mono text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">
          Episodes
        </span>
        <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 text-xs font-mono font-medium px-1.5">
          {episodes.length}
        </span>
        <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
      </div>

      {episodes.length === 0 ? (
        <div className="podcast-card p-8 text-center text-gray-500">
          <p>No episodes found yet. Episodes will appear after the next poll.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {episodes.map((episode) => (
            <Link
              key={episode.id}
              to="/episodes/$episodeId"
              params={{ episodeId: episode.id }}
              className="episode-row flex items-center justify-between rounded-lg p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 block"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-medium truncate">{episode.title}</h3>
                <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">
                  {new Date(episode.publishedAt).toLocaleDateString()}
                  {episode.durationSeconds && (
                    <span className="ml-2">
                      {Math.round(episode.durationSeconds / 60)} min
                    </span>
                  )}
                </p>
              </div>
              <span className={`status-badge status-${episode.status}`}>
                {episode.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
