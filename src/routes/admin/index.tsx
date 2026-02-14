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

  const handleGenerateAnalysis = async (force = false) => {
    setGeneratingAnalysis(true)
    setError(null)
    setMessage(null)
    try {
      const result = await generateWeeklyAnalysis({ data: { force } })
      if (result.cached) {
        setMessage(
          `Returned cached analysis (${result.episodeCount} episodes). Click "Force Refresh" to regenerate.`,
        )
      } else {
        setMessage(
          `Generated weekly analysis covering ${result.episodeCount} episodes.`,
        )
      }
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
        <div className="toast toast-warn">
          <p className="font-medium mb-1">
            <span className="font-mono text-xs bg-warn-200 dark:bg-warn-700 text-warn-800 dark:text-warn-200 rounded px-1.5 py-0.5 mr-2">DEMO</span>
            Demo Mode
          </p>
          <p className="text-sm">{DEMO_MESSAGE}</p>
        </div>
      )}

      {/* Demo Mode Banner */}
      {isDemo && (
        <div className="mb-6 p-4 bg-warn-50 dark:bg-warn-900/50 border border-warn-200 dark:border-warn-700 text-warn-800 dark:text-warn-200 rounded-lg">
          <p className="font-medium">
            <span className="font-mono text-xs bg-warn-200 dark:bg-warn-700 rounded px-1.5 py-0.5 mr-2">DEMO</span>
            Demo Mode
          </p>
          <p className="text-sm mt-1">{DEMO_MESSAGE}</p>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="font-heading text-4xl mb-2">Admin Panel</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Manage podcasts, trigger processing, and generate analyses.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error mb-4">
          <span className="alert-label bg-danger-200 dark:bg-danger-800 text-danger-700 dark:text-danger-300">ERR</span>
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="alert alert-success mb-4">
          <span className="alert-label bg-emerald-200 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300">OK</span>
          <span>{message}</span>
        </div>
      )}

      {/* Command Bar */}
      <section className="mb-10 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          {/* Add Podcast Form */}
          <form onSubmit={handleAddPodcast} className="flex-1">
            <label className="block text-xs font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
              Add Podcast
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="RSS feed URL or Apple Podcasts link"
                required
                className="flex-1 px-3 py-2 border rounded-md bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400"
              />
              <button
                type="submit"
                disabled={adding}
                className="btn btn-primary"
              >
                {adding ? 'Adding\u2026' : 'Add Podcast'}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Paste an RSS feed URL or an Apple Podcasts link. Apple links are automatically resolved to RSS feeds.
            </p>
          </form>

          {/* Divider */}
          <div className="hidden lg:block w-px h-14 bg-slate-300 dark:bg-slate-700" />

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handlePoll}
              disabled={polling}
              className="btn btn-secondary"
            >
              {polling ? 'Polling\u2026' : 'Poll All Feeds'}
            </button>
            <button
              onClick={() => handleGenerateAnalysis(false)}
              disabled={generatingAnalysis}
              className="btn btn-secondary"
            >
              {generatingAnalysis ? 'Generating\u2026' : 'Weekly Analysis'}
            </button>
            <button
              onClick={() => handleGenerateAnalysis(true)}
              disabled={generatingAnalysis}
              className="btn btn-secondary"
            >
              Force Refresh
            </button>
            <button
              onClick={handleCancelAllJobs}
              disabled={cancelling}
              className="btn btn-danger"
            >
              {cancelling ? 'Cancelling\u2026' : 'Cancel All Jobs'}
            </button>
          </div>
        </div>
      </section>

      {/* Podcasts Section */}
      <section>
        {/* Section Header */}
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Tracked Feeds
          </span>
          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 text-xs font-mono font-medium px-1.5">
            {podcasts.length}
          </span>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
        </div>

        {podcasts.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">
            No podcasts added yet.
          </p>
        ) : (
          <div className="space-y-6">
            {podcasts.map((podcast) => (
              <div
                key={podcast.id}
                className="podcast-card p-4"
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
                      <h3 className="font-heading text-lg">
                        <Link
                          to="/podcasts/$podcastId"
                          params={{ podcastId: podcast.id }}
                          className="hover:text-ink-500 dark:hover:text-ink-300 transition-colors"
                        >
                          {podcast.title}
                        </Link>
                      </h3>
                      <p className="text-xs font-mono text-gray-400 dark:text-gray-500 truncate max-w-md">
                        {podcast.feedUrl}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleImportPast(podcast.id)}
                      className="btn btn-sm btn-secondary"
                    >
                      Import Past
                    </button>
                    <button
                      onClick={() =>
                        handleToggle(podcast.id, podcast.active)
                      }
                      className={`btn btn-sm ${
                        podcast.active
                          ? 'btn-toggle-active'
                          : 'btn-toggle-inactive'
                      }`}
                    >
                      {podcast.active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() =>
                        handleRemove(podcast.id, podcast.title)
                      }
                      className="btn btn-sm btn-danger"
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
                          <th className="text-left px-3 py-2 font-mono text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
                            Episode
                          </th>
                          <th className="text-left px-3 py-2 font-mono text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium w-24">
                            Date
                          </th>
                          <th className="text-left px-3 py-2 font-mono text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium w-32">
                            Status
                          </th>
                          <th className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium w-28">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {podcast.episodes.slice(0, 10).map((episode) => (
                          <tr key={episode.id} className="episode-row">
                            <td className="px-3 py-2">
                              <Link
                                to="/episodes/$episodeId"
                                params={{ episodeId: episode.id }}
                                className="hover:text-ink-500 dark:hover:text-ink-300 truncate block max-w-md transition-colors"
                              >
                                {episode.title}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-gray-500 font-mono text-xs">
                              {new Date(
                                episode.publishedAt,
                              ).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`status-badge status-${episode.status}`}
                              >
                                {episode.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center space-x-1">
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
                                  className="btn btn-sm btn-primary"
                                >
                                  Process
                                </button>
                              )}
                              {(episode.status === 'complete' ||
                                episode.status === 'error' ||
                                episode.status === 'downloading' ||
                                episode.status === 'transcribing' ||
                                episode.status === 'analyzing') && (
                                <button
                                  onClick={() => handleResetEpisode(episode.id)}
                                  className="btn btn-sm btn-ghost"
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
                      <div className="px-3 py-2 text-xs font-mono text-gray-500 bg-gray-50 dark:bg-gray-800">
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
