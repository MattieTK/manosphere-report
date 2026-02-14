import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  getAdminData,
  getIsDemo,
  addPodcast,
  togglePodcast,
  removePodcast,
  triggerPoll,
  processEpisode,
  resetEpisode,
  importPastEpisodes,
  generateWeeklyAnalysis,
  cancelAllJobs,
} from '~/lib/server-fns'

const DEMO_MESSAGE =
  'This is a demo instance. To add your own podcasts, deploy this tool to your own Cloudflare account.'

function isDemoError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('DEMO_MODE')
}

export const Route = createFileRoute('/admin/')({
  loader: async () => {
    const [adminData, demoData] = await Promise.all([
      getAdminData(),
      getIsDemo(),
    ])
    return { ...adminData, isDemo: demoData.isDemo }
  },
  component: AdminPage,
})

function AdminPage() {
  const { podcasts, isDemo } = Route.useLoaderData()
  const router = useRouter()
  const [feedUrl, setFeedUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [polling, setPolling] = useState(false)
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [demoToast, setDemoToast] = useState(false)

  const handleDemoError = () => {
    setDemoToast(true)
    setTimeout(() => setDemoToast(false), 5000)
  }

  const handleAddPodcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!feedUrl.trim()) return

    setAdding(true)
    setError(null)
    setMessage(null)
    try {
      const result = await addPodcast({ data: { feedUrl: feedUrl.trim() } })
      setMessage(
        `Added "${result.title}" with ${result.episodeCount} episodes in feed.`,
      )
      setFeedUrl('')
      router.invalidate()
    } catch (err) {
      if (isDemoError(err)) {
        handleDemoError()
      } else {
        setError(err instanceof Error ? err.message : 'Failed to add podcast')
      }
    } finally {
      setAdding(false)
    }
  }

  const handlePoll = async () => {
    setPolling(true)
    setError(null)
    setMessage(null)
    try {
      await triggerPoll()
      setMessage('Poll triggered successfully. New episodes will appear shortly.')
      router.invalidate()
    } catch (err) {
      if (isDemoError(err)) {
        handleDemoError()
      } else {
        setError(err instanceof Error ? err.message : 'Failed to trigger poll')
      }
    } finally {
      setPolling(false)
    }
  }

  const handleToggle = async (podcastId: string, active: boolean) => {
    try {
      await togglePodcast({ data: { podcastId, active: !active } })
      router.invalidate()
    } catch (err) {
      if (isDemoError(err)) {
        handleDemoError()
      } else {
        setError(err instanceof Error ? err.message : 'Failed to toggle podcast')
      }
    }
  }

  const handleRemove = async (podcastId: string, title: string) => {
    if (!confirm(`Permanently delete "${title}" and all its episodes? This cannot be undone.`)) return
    try {
      const result = await removePodcast({ data: { podcastId } })
      setMessage(`Deleted "${title}" and ${result.deletedEpisodes} episode(s).`)
      router.invalidate()
    } catch (err) {
      if (isDemoError(err)) {
        handleDemoError()
      } else {
        setError(err instanceof Error ? err.message : 'Failed to remove podcast')
      }
    }
  }

  const handleProcessEpisode = async (
    episodeId: string,
    podcastId: string,
    audioUrl: string,
  ) => {
    try {
      await processEpisode({ data: { episodeId, podcastId, audioUrl } })
      router.invalidate()
    } catch (err) {
      if (isDemoError(err)) {
        handleDemoError()
      } else {
        setError(err instanceof Error ? err.message : 'Failed to trigger processing')
      }
    }
  }

  const handleResetEpisode = async (episodeId: string) => {
    try {
      await resetEpisode({ data: { episodeId } })
      router.invalidate()
    } catch (err) {
      if (isDemoError(err)) {
        handleDemoError()
      } else {
        setError(err instanceof Error ? err.message : 'Failed to reset episode')
      }
    }
  }

  const handleImportPast = async (podcastId: string) => {
    try {
      const result = await importPastEpisodes({ data: { podcastId } })
      setMessage(`Imported ${result.importedCount} past episodes.`)
      router.invalidate()
    } catch (err) {
      if (isDemoError(err)) {
        handleDemoError()
      } else {
        setError(err instanceof Error ? err.message : 'Failed to import past episodes')
      }
    }
  }

  const handleGenerateAnalysis = async () => {
    setGeneratingAnalysis(true)
    setError(null)
    setMessage(null)
    try {
      const result = await generateWeeklyAnalysis()
      setMessage(
        `Generated weekly analysis covering ${result.episodeCount} episodes.`,
      )
    } catch (err) {
      if (isDemoError(err)) {
        handleDemoError()
      } else {
        setError(
          err instanceof Error ? err.message : 'Failed to generate weekly analysis',
        )
      }
    } finally {
      setGeneratingAnalysis(false)
    }
  }

  const handleCancelAllJobs = async () => {
    if (!confirm('Cancel all running jobs and reset them to pending?')) return
    setCancelling(true)
    setError(null)
    setMessage(null)
    try {
      const result = await cancelAllJobs()
      setMessage(`Cancelled ${result.cancelledCount} running job(s).`)
      router.invalidate()
    } catch (err) {
      if (isDemoError(err)) {
        handleDemoError()
      } else {
        setError(err instanceof Error ? err.message : 'Failed to cancel jobs')
      }
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Demo Mode Toast */}
      {demoToast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-lg shadow-lg">
          <p className="font-medium mb-1">Demo Mode</p>
          <p className="text-sm">{DEMO_MESSAGE}</p>
        </div>
      )}

      {/* Demo Mode Banner */}
      {isDemo && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-lg">
          <p className="font-medium">Demo Mode</p>
          <p className="text-sm mt-1">{DEMO_MESSAGE}</p>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage podcasts, trigger processing, and generate analyses.
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-md text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-md text-sm">
          {message}
        </div>
      )}

      {/* Add Podcast Form */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Add Podcast</h2>
        <form onSubmit={handleAddPodcast} className="space-y-2">
          <div className="flex gap-3">
            <input
              type="url"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="RSS feed URL or Apple Podcasts link"
              required
              className="flex-1 px-3 py-2 border rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {adding ? 'Adding...' : 'Add Podcast'}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Paste an RSS feed URL or an Apple Podcasts link (e.g. https://podcasts.apple.com/us/podcast/....). Apple links are automatically resolved to RSS feeds.
          </p>
        </form>
      </section>

      {/* Actions */}
      <section className="mb-8 flex gap-3">
        <button
          onClick={handlePoll}
          disabled={polling}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 text-sm font-medium"
        >
          {polling ? 'Polling...' : 'Poll All Feeds Now'}
        </button>
        <button
          onClick={handleGenerateAnalysis}
          disabled={generatingAnalysis}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
        >
          {generatingAnalysis ? 'Generating...' : 'Generate Weekly Analysis'}
        </button>
        <button
          onClick={handleCancelAllJobs}
          disabled={cancelling}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
        >
          {cancelling ? 'Cancelling...' : 'Cancel All Jobs'}
        </button>
      </section>

      {/* Podcasts List */}
      <section>
        <h2 className="text-lg font-semibold mb-3">
          Podcasts ({podcasts.length})
        </h2>

        {podcasts.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">
            No podcasts added yet.
          </p>
        ) : (
          <div className="space-y-6">
            {podcasts.map((podcast) => (
              <div
                key={podcast.id}
                className="border rounded-lg p-4 bg-white dark:bg-gray-900"
              >
                {/* Podcast Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex gap-3">
                    {podcast.imageUrl && (
                      <img
                        src={podcast.imageUrl}
                        alt={podcast.title}
                        className="w-12 h-12 rounded object-cover"
                      />
                    )}
                    <div>
                      <h3 className="font-semibold">
                        <Link
                          to="/podcasts/$podcastId"
                          params={{ podcastId: podcast.id }}
                          className="hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {podcast.title}
                        </Link>
                      </h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {podcast.feedUrl}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleImportPast(podcast.id)}
                      className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      Import Past
                    </button>
                    <button
                      onClick={() =>
                        handleToggle(podcast.id, podcast.active)
                      }
                      className={`px-3 py-1 text-xs rounded ${
                        podcast.active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {podcast.active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() =>
                        handleRemove(podcast.id, podcast.title)
                      }
                      className="px-3 py-1 text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Episodes Table */}
                {podcast.episodes.length > 0 && (
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">
                            Episode
                          </th>
                          <th className="text-left px-3 py-2 font-medium w-24">
                            Date
                          </th>
                          <th className="text-left px-3 py-2 font-medium w-28">
                            Status
                          </th>
                          <th className="px-3 py-2 font-medium w-24">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {podcast.episodes.slice(0, 10).map((episode) => (
                          <tr key={episode.id}>
                            <td className="px-3 py-2">
                              <Link
                                to="/episodes/$episodeId"
                                params={{ episodeId: episode.id }}
                                className="hover:text-blue-600 dark:hover:text-blue-400 truncate block max-w-md"
                              >
                                {episode.title}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {new Date(
                                episode.publishedAt,
                              ).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  episode.status === 'complete'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                    : episode.status === 'error'
                                      ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                }`}
                              >
                                {episode.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center space-x-2">
                              {(episode.status === 'pending' ||
                                episode.status === 'error') && (
                                <button
                                  onClick={() =>
                                    handleProcessEpisode(
                                      episode.id,
                                      podcast.id,
                                      episode.audioUrl,
                                    )
                                  }
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  Process
                                </button>
                              )}
                              {episode.status === 'complete' && (
                                <button
                                  onClick={() => handleResetEpisode(episode.id)}
                                  className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
                                >
                                  Reset
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {podcast.episodes.length > 10 && (
                      <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800">
                        Showing 10 of {podcast.episodes.length} episodes
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
