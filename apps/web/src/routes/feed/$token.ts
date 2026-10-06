import { createFileRoute } from '@tanstack/react-router'
import { CalendarError } from '../../server/calendar-store'
import { feedService } from '../../server/feed-service'

export const Route = createFileRoute('/feed/$token')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token.endsWith('.ics') ? params.token.slice(0, -4) : params.token
        const headers = {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
          'Referrer-Policy': 'no-referrer',
        }

        try {
          const result = await feedService.forToken(token)

          return new Response(result.text, { headers })
        } catch (error) {
          const missing = error instanceof CalendarError

          return new Response(
            missing ? 'Calendar not found.' : 'Calendar temporarily unavailable. Please try again.',
            {
              status: missing ? 404 : 503,
              headers: { ...headers, 'Content-Type': 'text/plain', 'Retry-After': '60' },
            },
          )
        }
      },
    },
  },
})
