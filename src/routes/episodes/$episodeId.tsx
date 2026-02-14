import { createFileRoute, Link } from '@tanstack/react-router'
import { useRef, useState, useEffect, useCallback } from 'react'
import { getEpisodeDetail } from '~/lib/server-fns'
import { formatTime } from '~/lib/utils'

export const Route = createFileRoute('/episodes/$episodeId')({
  loader: ({ params }) =>
    getEpisodeDetail({ data: { episodeId: params.episodeId } }),
  component: EpisodeDetailPage,
})

function EpisodeDetailPage() {
  const { episode, podcast, segments, analysis } = Route.useLoaderData()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [])

  const activeSegmentIndex = segments.findIndex(
    (s) => currentTime >= s.startTime && currentTime < s.endTime,
  )

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegmentIndex < 0 || !isPlaying) return
    const el = document.getElementById(`segment-${activeSegmentIndex}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeSegmentIndex, isPlaying])

  const handleSegmentClick = useCallback((startTime: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = startTime
    audio.play()
  }, [])

  const tags = analysis?.tags ? JSON.parse(analysis.tags) : []
  const themes = analysis?.themes ? JSON.parse(analysis.themes) : []
  const keyQuotes = analysis?.keyQuotes ? JSON.parse(analysis.keyQuotes) : []

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm">
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">
          Home
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        {podcast && (
          <>
            <Link
              to="/podcasts/$podcastId"
              params={{ podcastId: podcast.id }}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {podcast.title}
            </Link>
            <span className="mx-2 text-gray-400">/</span>
          </>
        )}
        <span className="text-gray-600 dark:text-gray-400 truncate">
          {episode.title}
        </span>
      </nav>

      {/* Episode Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{episode.title}</h1>
        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span>{new Date(episode.publishedAt).toLocaleDateString()}</span>
          {episode.durationSeconds && (
            <span>{Math.round(episode.durationSeconds / 60)} min</span>
          )}
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              episode.status === 'complete'
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {episode.status}
          </span>
        </div>
      </div>

      {/* Audio Player - Sticky */}
      {episode.r2Key && (
        <div className="sticky top-16 z-10 bg-white dark:bg-gray-900 border rounded-lg p-4 mb-6 shadow-sm">
          <audio
            ref={audioRef}
            src={`/api/audio/${episode.id}`}
            controls
            preload="metadata"
            className="w-full"
          />
        </div>
      )}

      {/* Main Content: Transcript + Sidebar */}
      <div className="flex gap-8">
        {/* Transcript */}
        <div className="flex-1 min-w-0" ref={transcriptRef}>
          <h2 className="text-lg font-semibold mb-4">Transcript</h2>

          {segments.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
              {episode.status === 'complete'
                ? 'No transcript available.'
                : `Episode is ${episode.status}. Transcript will appear when processing completes.`}
            </div>
          ) : (
            <div className="space-y-1">
              {segments.map((segment, i) => (
                <div
                  key={segment.id}
                  id={`segment-${i}`}
                  onClick={() => handleSegmentClick(segment.startTime)}
                  className={`flex gap-3 p-2 rounded cursor-pointer transition-colors ${
                    i === activeSegmentIndex
                      ? 'bg-blue-50 dark:bg-blue-950 border-l-2 border-blue-500'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-900'
                  }`}
                >
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono flex-shrink-0 pt-0.5 w-12 text-right">
                    {formatTime(segment.startTime)}
                  </span>
                  <span className="text-sm leading-relaxed">
                    {segment.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Analysis Sidebar */}
        {analysis && (
          <aside className="w-80 flex-shrink-0 hidden lg:block">
            <div className="sticky top-36 space-y-6">
              {/* Summary */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Summary</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {analysis.summary}
                </p>
              </div>

              {/* Sentiment */}
              {analysis.sentiment && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Tone</h3>
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-sm rounded">
                    {analysis.sentiment}
                  </span>
                </div>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Tags</h3>
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tag: string, i: number) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Themes */}
              {themes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Themes</h3>
                  <div className="space-y-2">
                    {themes.map(
                      (
                        theme: { theme: string; description: string },
                        i: number,
                      ) => (
                        <div key={i}>
                          <p className="text-sm font-medium">{theme.theme}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {theme.description}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {/* Key Quotes */}
              {keyQuotes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Key Quotes</h3>
                  <div className="space-y-2">
                    {keyQuotes.map((quote: string, i: number) => (
                      <blockquote
                        key={i}
                        className="text-sm italic text-gray-600 dark:text-gray-400 border-l-2 border-gray-300 dark:border-gray-700 pl-3"
                      >
                        "{quote}"
                      </blockquote>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
