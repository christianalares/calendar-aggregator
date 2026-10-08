import { FetchError, fetchCalendar, fetchLimits } from './upstream'

export function createSourceFetcher(
  connection: { url?: string; secret?: string },
  direct = (url: string) => fetchCalendar(url),
  request = globalThis.fetch,
) {
  return async (url: string, options?: { useBrowser: boolean }) => {
    try {
      return await direct(url)
    } catch (error) {
      if (!options?.useBrowser) throw error
    }

    if (!connection.url || !connection.secret) {
      throw new FetchError('Browser fetching is not configured. Contact the service operator.')
    }
    try {
      const response = await request(new URL('/fetch', connection.url), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new FetchError(
          response.status === 429
            ? 'The browser connection is busy. This source will retry on the next eligible check.'
            : response.status === 422
              ? 'Browser fetching is not enabled for this calendar provider yet.'
              : 'The browser connection could not fetch this calendar. Last successful data is retained.',
        )
      }
      if (!response.body) throw new FetchError('The browser returned no calendar data.')
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > fetchLimits.maxBytes) {
            throw new FetchError('The calendar feed is too large to fetch safely.')
          }
          chunks.push(value)
        }
      } finally {
        await reader.cancel().catch(() => {})
      }
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) {
        throw new FetchError('The browser returned a verification page instead of calendar data.')
      }
      return text
    } catch (error) {
      throw error instanceof FetchError
        ? error
        : new FetchError(
            'The browser connection failed or timed out. Try checking the source again.',
          )
    }
  }
}
