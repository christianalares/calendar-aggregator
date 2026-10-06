import { type Database, sources } from '@calendar-aggregator/db'
import { and, eq, isNull, lte, or } from 'drizzle-orm'
import { CalendarError, createCalendarStore } from './calendar-store'
import { CalendarParseError, mergeCalendars, previewCalendar, sanitizeCalendar } from './ical'
import { FetchError, fetchCalendar } from './upstream'

export const cachePolicy = {
  freshMs: 15 * 60_000,
  retryMs: 60_000,
  leaseMs: 15_000,
  concurrency: 4,
}
export class FeedUnavailable extends Error {}

export function createFeedService(db: Database, fetch = fetchCalendar, now = () => Date.now()) {
  const store = createCalendarStore(db)
  let active = 0
  const waiting: (() => void)[] = []

  async function refresh(source: typeof sources.$inferSelect) {
    const time = new Date(now())

    if (source.nextFetchAt && source.nextFetchAt > time) {
      return source
    }

    if (active >= cachePolicy.concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    } else {
      active++
    }

    try {
      const attempt = new Date(now())
      const lease = new Date(now() + cachePolicy.leaseMs)
      const [claimed] = await db
        .update(sources)
        .set({ leaseUntil: lease, lastAttemptAt: attempt })
        .where(
          and(
            eq(sources.id, source.id),
            eq(sources.version, source.version),
            eq(sources.enabled, true),
            or(isNull(sources.nextFetchAt), lte(sources.nextFetchAt, attempt)),
            or(isNull(sources.leaseUntil), lte(sources.leaseUntil, attempt)),
          ),
        )
        .returning()

      if (claimed) {
        let snapshot: string | undefined
        let error: string | null = null

        try {
          snapshot = sanitizeCalendar(await fetch(claimed.url), claimed.url)
        } catch (failure) {
          error =
            failure instanceof FetchError || failure instanceof CalendarParseError
              ? failure.message
              : 'Could not refresh this source. Check the subscription and try again.'
        }

        const success = snapshot !== undefined && !error
        await db
          .update(sources)
          .set({
            ...(success ? { snapshot, lastSuccessAt: new Date(now()) } : {}),
            lastError: error,
            nextFetchAt: new Date(now() + (success ? cachePolicy.freshMs : cachePolicy.retryMs)),
            leaseUntil: null,
          })
          .where(
            and(
              eq(sources.id, claimed.id),
              eq(sources.version, claimed.version),
              eq(sources.leaseUntil, lease),
            ),
          )
      }

      const [current] = await db.select().from(sources).where(eq(sources.id, source.id))

      return current ?? null
    } finally {
      const next = waiting.shift()

      if (next) {
        next()
      } else {
        active--
      }
    }
  }

  async function build(output: NonNullable<Awaited<ReturnType<typeof store.outputForToken>>>) {
    const included = await store.includedSources(output)
    const checked = await Promise.all(
      included.map(async ({ source, prefix }) => ({ source: await refresh(source), prefix })),
    )
    const available = checked.flatMap(({ source, prefix }) =>
      source?.enabled && source.snapshot !== null
        ? [{ id: source.id, url: source.url, snapshot: source.snapshot, prefix }]
        : [],
    )

    if (included.length && !available.length) {
      throw new FeedUnavailable(
        'No selected source has usable calendar data yet. Check source status and try again.',
      )
    }

    const text = mergeCalendars(output.name, available)
    const health = checked.flatMap(({ source }) =>
      source
        ? [
            {
              id: source.id,
              name: source.name,
              lastAttemptAt: source.lastAttemptAt,
              lastSuccessAt: source.lastSuccessAt,
              error: source.lastError,
              status:
                source.snapshot === null ? 'unavailable' : source.lastError ? 'stale' : 'healthy',
            },
          ]
        : [],
    )

    return { text, health }
  }

  return {
    async forToken(token: string) {
      const output = /^[a-f0-9]{64}$/.test(token) ? await store.outputForToken(token) : null

      if (!output) {
        throw new CalendarError('Calendar not found.')
      }

      return await build(output)
    },
    async preview(ownerId: string, outputId: string) {
      const output = await store.requireOutput(ownerId, outputId)
      const result = await build(output)

      return { events: previewCalendar(result.text), health: result.health }
    },
    async checkSource(ownerId: string, sourceId: string) {
      const [source] = await db
        .select()
        .from(sources)
        .where(and(eq(sources.id, sourceId), eq(sources.ownerId, ownerId)))

      if (!source) {
        throw new CalendarError('Source not found.')
      }

      if (!source.enabled) {
        throw new CalendarError('Enable the source before checking it.')
      }

      // This reuses cache/retry bounds; repeated button clicks do not hammer providers.
      const current = await refresh(source)

      return { error: current?.lastError, lastSuccessAt: current?.lastSuccessAt }
    },
  }
}
