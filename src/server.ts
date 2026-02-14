import handler from '@tanstack/react-start/server-entry'

// Re-export the Workflow class so Cloudflare can discover it
export { EpisodeProcessingWorkflow } from './workflows/episode-processing'

export default {
  fetch: handler.fetch,

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ) {
    const { pollAllFeeds } = await import('./lib/rss')
    ctx.waitUntil(pollAllFeeds(env))
  },
}
