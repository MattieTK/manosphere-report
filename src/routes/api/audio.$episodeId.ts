import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { getDb } from '~/db'
import { episodes } from '~/db/schema'

export const Route = createFileRoute('/api/audio/$episodeId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const db = getDb(env.DB)

        const [episode] = await db
          .select({ r2Key: episodes.r2Key })
          .from(episodes)
          .where(eq(episodes.id, params.episodeId))
          .limit(1)

        if (!episode?.r2Key) {
          return new Response('Not found', { status: 404 })
        }

        const rangeHeader = request.headers.get('Range')

        // Parse Range header for partial content requests
        let r2Options: R2GetOptions | undefined
        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
          if (match) {
            const start = parseInt(match[1], 10)
            const end = match[2] ? parseInt(match[2], 10) : undefined
            r2Options = {
              range: end !== undefined ? { offset: start, length: end - start + 1 } : { offset: start },
            }
          }
        }

        const object = await env.AUDIO_BUCKET.get(episode.r2Key, r2Options)

        if (!object) {
          return new Response('Audio not found', { status: 404 })
        }

        const headers = new Headers()
        object.writeHttpMetadata(headers)
        headers.set('Accept-Ranges', 'bytes')
        headers.set('Content-Type', 'audio/mpeg')
        headers.set('Cache-Control', 'public, max-age=86400')

        if (rangeHeader && r2Options?.range) {
          const range = r2Options.range as { offset: number; length?: number }
          const start = range.offset
          const end = range.length
            ? start + range.length - 1
            : object.size - 1
          const total = object.size

          headers.set('Content-Range', `bytes ${start}-${end}/${total}`)
          headers.set('Content-Length', String(end - start + 1))

          return new Response(object.body, {
            status: 206,
            headers,
          })
        }

        headers.set('Content-Length', String(object.size))
        return new Response(object.body, {
          status: 200,
          headers,
        })
      },
    },
  },
})
