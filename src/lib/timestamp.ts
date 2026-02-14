export interface Word {
  word: string
  start: number
  end: number
}

export interface Segment {
  text: string
  startTime: number
  endTime: number
  words: Word[]
}

/**
 * Groups words into readable sentence-like segments.
 * Prefers breaking at sentence-ending punctuation (.!?)
 * Falls back to breaking at target word count.
 */
export function groupWordsIntoSegments(
  words: Word[],
  targetWordsPerSegment: number = 15,
): Segment[] {
  if (words.length === 0) return []

  const segments: Segment[] = []
  let currentWords: Word[] = []

  for (let i = 0; i < words.length; i++) {
    currentWords.push(words[i])

    const wordText = words[i].word.trim()
    const endsWithPunctuation = /[.!?]$/.test(wordText)
    const atTarget = currentWords.length >= targetWordsPerSegment
    const isLast = i === words.length - 1

    if ((endsWithPunctuation && currentWords.length >= 5) || atTarget || isLast) {
      segments.push({
        text: currentWords.map((w) => w.word).join(' ').trim(),
        startTime: currentWords[0].start,
        endTime: currentWords[currentWords.length - 1].end,
        words: [...currentWords],
      })
      currentWords = []
    }
  }

  return segments
}
