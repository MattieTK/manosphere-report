const ANALYSIS_SYSTEM_PROMPT = `You are an expert media analyst specializing in podcast content analysis.
Analyze the following podcast transcript and return a JSON object with exactly these fields:
- "summary": A 2-3 paragraph summary of the episode's main points and arguments
- "tags": An array of 5-15 topic tags as strings (e.g., ["dating", "masculinity", "self-improvement"])
- "themes": An array of objects with "theme" and "description" fields identifying major themes discussed
- "sentiment": A brief overall tone assessment (e.g., "confrontational", "educational", "motivational", "conversational")
- "keyQuotes": An array of 3-5 notable direct quotes from the transcript

Return ONLY valid JSON. No markdown formatting, no code fences, no explanation outside the JSON.`

const WEEKLY_ANALYSIS_SYSTEM_PROMPT = `You are an expert media analyst who studies podcast ecosystems.
Given summaries and analyses of podcast episodes from the past week, produce a comprehensive trend analysis.

Your analysis should be in markdown format and include:

1. **Trending Topics**: What topics appeared across multiple shows this week?
2. **Cross-Show Themes**: How did different podcasts present similar themes? Where did they agree or disagree?
3. **Emerging Narratives**: What new narratives or talking points are gaining traction?
4. **Rhetoric Patterns**: How are these topics being framed? What persuasion techniques are being used?
5. **Notable Shifts**: Any changes in tone, focus, or positioning compared to typical content?

Also return a JSON array of trending topic strings at the very end, wrapped in a <topics> tag like:
<topics>["topic1", "topic2", ...]</topics>

Be specific and cite which podcasts discussed which topics.`

export interface AnalysisResult {
  summary: string
  tags: string[]
  themes: { theme: string; description: string }[]
  sentiment: string
  keyQuotes: string[]
}

export function buildAnalysisPrompt(transcript: string): string {
  // Truncate very long transcripts - use conservative limit
  // (~50k chars = ~12k tokens to leave room for response)
  const maxChars = 50000
  const truncated =
    transcript.length > maxChars
      ? transcript.slice(0, maxChars) + '\n\n[TRANSCRIPT TRUNCATED]'
      : transcript

  return `Analyze this podcast episode transcript:\n\n${truncated}`
}

export function parseAnalysisResult(response: string): AnalysisResult {
  // Try to extract JSON from the response
  let jsonStr = response.trim()

  // Remove potential markdown code fences
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      summary: parsed.summary || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      sentiment: parsed.sentiment || '',
      keyQuotes: Array.isArray(parsed.keyQuotes) ? parsed.keyQuotes : [],
    }
  } catch {
    // Fallback: extract what we can
    return {
      summary: response.slice(0, 2000),
      tags: [],
      themes: [],
      sentiment: 'unknown',
      keyQuotes: [],
    }
  }
}

export interface WeeklyAnalysisInput {
  podcastTitle: string
  episodeTitle: string
  summary: string
  tags: string[]
  themes: { theme: string; description: string }[]
}

export function buildWeeklyAnalysisPrompt(
  episodes: WeeklyAnalysisInput[],
): string {
  const episodeSummaries = episodes
    .map(
      (ep) =>
        `## ${ep.podcastTitle}: "${ep.episodeTitle}"\n\nSummary: ${ep.summary}\n\nTags: ${ep.tags.join(', ')}\n\nThemes: ${ep.themes.map((t) => `${t.theme}: ${t.description}`).join('; ')}`,
    )
    .join('\n\n---\n\n')

  return `Here are the podcast episode analyses from this past week:\n\n${episodeSummaries}`
}

export function parseWeeklyAnalysis(response: string): {
  analysis: string
  trendingTopics: string[]
} {
  let analysis = response
  let trendingTopics: string[] = []

  // Extract topics from <topics> tag
  const topicsMatch = response.match(/<topics>(.*?)<\/topics>/s)
  if (topicsMatch) {
    try {
      trendingTopics = JSON.parse(topicsMatch[1])
    } catch {
      // Ignore parse errors
    }
    analysis = response.replace(/<topics>.*?<\/topics>/s, '').trim()
  }

  return { analysis, trendingTopics }
}

export { ANALYSIS_SYSTEM_PROMPT, WEEKLY_ANALYSIS_SYSTEM_PROMPT }
