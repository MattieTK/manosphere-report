import { createFileRoute, Link } from '@tanstack/react-router'
import { getPodcastDetail } from '~/lib/server-fns'

export const Route = createFileRoute('/podcasts/$podcastId')({
  loader: ({ params }) =>
    getPodcastDetail({ data: { podcastId: params.podcastId } }),
  component: PodcastDetailPage,
})

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    downloading:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    transcribing:
      'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    analyzing:
      'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    complete:
      'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  }

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}
    >
      {status}
    </span>
  )
}

function PodcastDetailPage() {
  const { podcast, episodes } = Route.useLoaderData()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm">
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">
          Home
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-600 dark:text-gray-400">{podcast.title}</span>
      </nav>

      {/* Podcast Header */}
      <div className="flex gap-6 mb-8">
        {podcast.imageUrl && (
          <img
            src={podcast.imageUrl}
            alt={podcast.title}
            className="w-32 h-32 rounded-lg object-cover flex-shrink-0"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold mb-2">{podcast.title}</h1>
          {podcast.description && (
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 line-clamp-3">
              {podcast.description}
            </p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Feed: {podcast.feedUrl}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Tracking since{' '}
            {new Date(podcast.addedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Episodes */}
      <h2 className="text-xl font-semibold mb-4">
        Episodes ({episodes.length})
      </h2>

      {episodes.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-gray-500">
          <p>No episodes found yet. Episodes will appear after the next poll.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {episodes.map((episode) => (
            <Link
              key={episode.id}
              to="/episodes/$episodeId"
              params={{ episodeId: episode.id }}
              className="flex items-center justify-between border rounded-lg p-4 hover:border-blue-400 dark:hover:border-blue-600 transition-colors bg-white dark:bg-gray-900"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-medium truncate">{episode.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {new Date(episode.publishedAt).toLocaleDateString()}
                  {episode.durationSeconds && (
                    <span className="ml-2">
                      {Math.round(episode.durationSeconds / 60)} min
                    </span>
                  )}
                </p>
              </div>
              <StatusBadge status={episode.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
