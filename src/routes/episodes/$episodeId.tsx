import { createFileRoute, Link } from '@tanstack/react-router'
import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import Markdown from 'react-markdown'
import { getEpisodeDetail } from '~/lib/server-fns'
import { formatTime } from '~/lib/utils'

export const Route = createFileRoute('/episodes/$episodeId')({
  loader: ({ params }) =>
    getEpisodeDetail({ data: { episodeId: params.episodeId } }),
  component: EpisodeDetailPage,
})

function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="transcript-match-text">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

function EpisodeDetailPage() {
  const { episode, podcast, segments, analysis } = Route.useLoaderData()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  const matchIndices = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return segments.reduce<number[]>((acc, segment, i) => {
      if (segment.text.toLowerCase().includes(q)) acc.push(i)
      return acc
    }, [])
  }, [searchQuery, segments])

  const isSearchActive = searchQuery.trim().length > 0

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

  // Auto-scroll to active segment (suppressed during search)
  useEffect(() => {
    if (isSearchActive) return
    if (activeSegmentIndex < 0 || !isPlaying) return
    const el = document.getElementById(`segment-${activeSegmentIndex}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeSegmentIndex, isPlaying, isSearchActive])

  // Scroll to current search match
  useEffect(() => {
    if (!isSearchActive || matchIndices.length === 0) return
    const segmentIdx = matchIndices[currentMatchIndex]
    const el = document.getElementById(`segment-${segmentIdx}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentMatchIndex, matchIndices, isSearchActive])

  // Reset match index when matches change
  useEffect(() => {
    setCurrentMatchIndex(0)
  }, [matchIndices])

  const navigateMatch = useCallback(
    (direction: 'next' | 'prev') => {
      if (matchIndices.length === 0) return
      setCurrentMatchIndex((prev) => {
        if (direction === 'next') return (prev + 1) % matchIndices.length
        return (prev - 1 + matchIndices.length) % matchIndices.length
      })
    },
    [matchIndices.length],
  )

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setCurrentMatchIndex(0)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+F to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      // Only handle these when search input is focused
      if (document.activeElement !== searchInputRef.current) return

      if (e.key === 'Enter') {
        e.preventDefault()
        navigateMatch(e.shiftKey ? 'prev' : 'next')
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        clearSearch()
        searchInputRef.current?.blur()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [navigateMatch, clearSearch])

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
      <nav className="mb-6 text-sm font-mono">
        <Link to="/" className="text-ink-500 dark:text-ink-300 hover:text-ink-700 dark:hover:text-ink-200 transition-colors">
          Home
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        {podcast && (
          <>
            <Link
              to="/podcasts/$podcastId"
              params={{ podcastId: podcast.id }}
              className="text-ink-500 dark:text-ink-300 hover:text-ink-700 dark:hover:text-ink-200 transition-colors"
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
        <h1 className="font-heading text-3xl mb-2">{episode.title}</h1>
        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span className="font-mono text-xs">
            {new Date(episode.publishedAt).toLocaleDateString()}
          </span>
          {episode.durationSeconds && (
            <span className="font-mono text-xs">{Math.round(episode.durationSeconds / 60)} min</span>
          )}
          <span className={`status-badge status-${episode.status}`}>
            {episode.status}
          </span>
        </div>
      </div>

      {/* Audio Player - Sticky */}
      {episode.r2Key && (
        <div className="sticky top-16 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 mb-6 shadow-sm">
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
        <div className="flex-1 min-w-0">
          <p className="sidebar-label mb-4">Transcript</p>

          {/* Search bar */}
          {segments.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transcript…"
                  className="w-full px-3 py-2 pr-8 border rounded-md bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400 border-gray-200 dark:border-gray-700"
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    aria-label="Clear search"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 1l12 12M13 1L1 13" />
                    </svg>
                  </button>
                )}
              </div>
              {isSearchActive && (
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 font-mono flex-shrink-0">
                  <span>
                    {matchIndices.length === 0
                      ? 'No matches'
                      : `${currentMatchIndex + 1}/${matchIndices.length}`}
                  </span>
                  <button
                    onClick={() => navigateMatch('prev')}
                    disabled={matchIndices.length === 0}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                    aria-label="Previous match"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 8L6 5L3 8" />
                    </svg>
                  </button>
                  <button
                    onClick={() => navigateMatch('next')}
                    disabled={matchIndices.length === 0}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                    aria-label="Next match"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 4L6 7L9 4" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {segments.length === 0 ? (
            <div className="podcast-card p-8 text-center text-gray-500 dark:text-gray-400">
              {episode.status === 'complete'
                ? 'No transcript available.'
                : `Episode is ${episode.status}. Transcript will appear when processing completes.`}
            </div>
          ) : (
            <div ref={transcriptRef} className="h-[calc(100dvh-14rem)] overflow-y-auto space-y-1">
              {segments.map((segment, i) => {
                const isMatch = isSearchActive && matchIndices.includes(i)
                const isCurrentMatch =
                  isMatch && matchIndices[currentMatchIndex] === i

                return (
                  <div
                    key={segment.id}
                    id={`segment-${i}`}
                    onClick={() => handleSegmentClick(segment.startTime)}
                    className={`transcript-segment ${
                      i === activeSegmentIndex
                        ? 'transcript-segment-active'
                        : ''
                    } ${isCurrentMatch ? 'transcript-segment-match-current' : isMatch ? 'transcript-segment-match' : ''}`}
                  >
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono flex-shrink-0 pt-0.5 w-12 text-right">
                      {formatTime(segment.startTime)}
                    </span>
                    <span className="text-sm leading-relaxed">
                      {isMatch
                        ? highlightText(segment.text, searchQuery)
                        : segment.text}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Analysis Sidebar */}
        {analysis && (
          <aside className="w-80 flex-shrink-0 hidden lg:block">
            <div className="sticky top-36 max-h-[calc(100dvh-10rem)] overflow-y-auto space-y-6">
              {/* Summary */}
              <div>
                <p className="sidebar-label">Summary</p>
                <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-400">
                  <Markdown>{analysis.summary}</Markdown>
                </div>
              </div>

              {/* Sentiment */}
              {analysis.sentiment && (
                <div>
                  <p className="sidebar-label">Tone</p>
                  <span className="inline-block px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-sm rounded font-mono">
                    {analysis.sentiment}
                  </span>
                </div>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div>
                  <p className="sidebar-label">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag: string, i: number) => (
                      <span key={i} className="topic-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Themes */}
              {themes.length > 0 && (
                <div>
                  <p className="sidebar-label">Themes</p>
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
                  <p className="sidebar-label">Key Quotes</p>
                  <div className="space-y-2">
                    {keyQuotes.map((quote: string, i: number) => (
                      <blockquote
                        key={i}
                        className="text-sm italic text-gray-600 dark:text-gray-400 border-l-2 border-ink-300 dark:border-ink-600 pl-3"
                      >
                        &ldquo;{quote}&rdquo;
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
