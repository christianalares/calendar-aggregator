import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createCalendarStore } from '../apps/web/src/server/calendar-store'
import { cachePolicy, createFeedService } from '../apps/web/src/server/feeds'
import { previewCalendar } from '../apps/web/src/server/ical'
import { FetchError } from '../apps/web/src/server/upstream'
import type { EventFilterRule } from '../packages/db/src/event-filters'
import { authUsers, connectDatabase, members, sources } from '../packages/db/src/index'
import { type TitleRule, titleFormattingFromPrefix } from '../packages/db/src/title-formatting'

const databaseURL = process.env.TEST_DATABASE_URL!
if (
  new URL(databaseURL).hostname !== '127.0.0.1' ||
  !new URL(databaseURL).pathname.endsWith('_test')
) {
  throw new Error('Use an isolated local test database.')
}
const connection = connectDatabase(databaseURL)
const { db } = connection
const store = createCalendarStore(db)
const fixture = readFileSync(new URL('./fixtures/complex.ics', import.meta.url), 'utf8')
const empty = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:fixture\r\nEND:VCALENDAR'
afterAll(() => connection.close())
async function owner() {
  const id = randomUUID()
  await db
    .insert(authUsers)
    .values({ id, name: 'Owner', email: `${id}@example.test`, emailVerified: true })
  await db.insert(members).values({ userId: id })

  return id
}
async function setup(count = 1) {
  const id = await owner()
  const selected = []
  for (let i = 0; i < count; i++) {
    const source = await store.saveSource(id, {
      name: `Source ${i}`,
      url: `https://provider.test/${randomUUID()}?token=secret-credential`,
      enabled: true,
    })
    selected.push({ sourceId: source.id, prefix: '⚽' })
  }
  const output = await store.saveOutput(id, { name: 'Our week', sources: selected })
  const row = await store.requireOutput(id, output.id)

  return { owner: id, output: row, selected }
}

describe('owner-scoped configuration', () => {
  it('previews unsaved filters, persists them per output and preserves cached snapshots and URLs', async () => {
    const a = await setup()
    const sourceId = a.selected[0]!.sourceId
    const feed = createFeedService(db, async () => fixture)
    const filters: EventFilterRule[] = [
      {
        id: 'exclude-holiday',
        enabled: true,
        field: 'title',
        operator: 'contains',
        value: 'away',
        caseSensitive: false,
      },
    ]
    expect(await store.previewFilters(a.owner, sourceId, filters)).toMatchObject({
      available: false,
      total: 0,
    })
    await feed.forToken(a.output.token)
    expect(await store.previewFilters(a.owner, sourceId, filters)).toMatchObject({
      available: true,
      total: 4,
      excludedCount: 1,
      keptCount: 3,
    })
    expect((await store.list(a.owner)).outputs[0]!.sources[0]!.eventFilters).toEqual([])
    await expect(store.previewFilters(await owner(), sourceId, filters)).rejects.toThrow(
      'not found',
    )
    await store.saveOutput(a.owner, {
      id: a.output.id,
      name: a.output.name,
      sources: [{ sourceId, prefix: '⚽', eventFilters: filters }],
    })
    const other = await store.saveOutput(a.owner, { name: 'Unfiltered', sources: a.selected })
    expect((await store.list(a.owner)).outputs[0]!.sources[0]!.eventFilters).toEqual(filters)
    expect((await store.requireOutput(a.owner, a.output.id)).token).toBe(a.output.token)
    expect((await feed.preview(a.owner, a.output.id)).events).toHaveLength(3)
    expect(previewCalendar((await feed.forToken(a.output.token)).text)).toHaveLength(3)
    expect((await feed.preview(a.owner, other.id)).events).toHaveLength(4)
    const [source] = await db.select().from(sources).where(eq(sources.id, sourceId))
    expect(source!.snapshot).toContain('SUMMARY:Weekend away')
    await db
      .update(sources)
      .set({ lastError: 'Provider unavailable' })
      .where(eq(sources.id, sourceId))
    expect(await store.previewFilters(a.owner, sourceId, filters)).toMatchObject({
      available: true,
      error: 'Provider unavailable',
      excludedCount: 1,
    })
    const restarted = connectDatabase(databaseURL)
    try {
      expect(
        (await createCalendarStore(restarted.db).list(a.owner)).outputs[0]!.sources[0]!
          .eventFilters,
      ).toEqual(filters)
    } finally {
      await restarted.close()
    }
    await store.saveOutput(a.owner, {
      id: a.output.id,
      name: a.output.name,
      sources: [{ sourceId, eventFilters: [{ ...filters[0]!, value: 'a' }] }],
    })
    expect(previewCalendar((await feed.forToken(a.output.token)).text)).toEqual([])
  })
  it('persists per-output formatting and uses the same transformation in the feed and preview', async () => {
    const a = await setup()
    const rule: TitleRule = {
      id: 'rename',
      name: 'Matchday',
      enabled: true,
      caseSensitive: false,
      match: [{ kind: 'text', value: 'Fotboll' }],
      show: [{ kind: 'text', value: 'Matchdag' }],
    }
    const settings = { ...titleFormattingFromPrefix('⚽'), rules: [rule] }
    await store.saveOutput(a.owner, {
      id: a.output.id,
      name: 'Our week',
      sources: [{ sourceId: a.selected[0]!.sourceId, titleFormatting: settings }],
    })
    const other = await store.saveOutput(a.owner, { name: 'Other', sources: a.selected })
    const feed = createFeedService(db, async () => fixture)
    expect(
      (await store.list(a.owner)).outputs.find((output) => output.id === a.output.id)?.sources[0]
        ?.titleFormatting,
    ).toEqual(settings)
    expect(previewCalendar((await feed.forToken(a.output.token)).text)[0]?.title).toBe(
      '⚽ Matchdag',
    )
    expect((await feed.preview(a.owner, a.output.id)).events[0]?.title).toBe('⚽ Matchdag')
    expect(
      previewCalendar(
        (await feed.forToken((await store.requireOutput(a.owner, other.id)).token)).text,
      )[0]?.title,
    ).toBe('⚽ Fotboll')
    expect((await store.list(a.owner)).sources[0]?.sampleTitles).toContain('Fotboll')
    expect((await store.requireOutput(a.owner, a.output.id)).token).toBe(a.output.token)
  })
  it('keeps accounts isolated even when a caller knows another owner’s IDs', async () => {
    const a = await setup()
    const b = await owner()
    expect(await store.list(b)).toEqual({ sources: [], outputs: [] })
    await expect(store.requireOutput(b, a.output.id)).rejects.toThrow('not found')
    await expect(store.rotateOutput(b, a.output.id)).rejects.toThrow('not found')
    await expect(store.removeOutput(b, a.output.id)).rejects.toThrow('not found')
    await expect(store.removeSource(b, a.selected[0]!.sourceId)).rejects.toThrow('not found')
    await expect(
      store.saveSource(b, {
        id: a.selected[0]!.sourceId,
        name: 'Stolen',
        url: 'https://evil.test',
        enabled: false,
      }),
    ).rejects.toThrow('not found')
    await expect(store.saveOutput(b, { name: 'Stolen', sources: a.selected })).rejects.toThrow(
      'own account',
    )
    await expect(
      store.saveOutput(b, { id: a.output.id, name: 'Stolen', sources: [] }),
    ).rejects.toThrow('not found')
  })
  it('keeps URLs stable through edits and isolates overlapping outputs and their prefixes', async () => {
    const a = await setup()
    const second = await store.saveOutput(a.owner, {
      name: 'Other',
      sources: [{ sourceId: a.selected[0]!.sourceId, prefix: '👟' }],
    })
    const secondRow = await store.requireOutput(a.owner, second.id)
    await store.saveOutput(a.owner, { id: a.output.id, name: 'Renamed', sources: [] })
    expect((await store.requireOutput(a.owner, a.output.id)).token).toBe(a.output.token)
    expect(await store.includedSources(secondRow)).toHaveLength(1)
    expect((await store.includedSources(secondRow))[0]?.prefix).toBe('👟')
    const rotated = await store.rotateOutput(a.owner, a.output.id)
    expect(rotated.token).not.toBe(a.output.token)
    expect(await store.outputForToken(a.output.token)).toBeNull()
    expect((await store.outputForToken(secondRow.token))?.id).toBe(second.id)
    const restarted = connectDatabase(databaseURL)
    try {
      expect(
        (await createCalendarStore(restarted.db).requireOutput(a.owner, a.output.id)).token,
      ).toBe(rotated.token)
    } finally {
      await restarted.close()
    }
  })
})

describe('durable bounded source cache and publication', () => {
  it('shares cached fetches across outputs, retains good snapshots on failure and recovers with an empty snapshot', async () => {
    const a = await setup()
    let clock = Date.now()
    const fetch = vi.fn(async () => fixture)
    const feed = createFeedService(db, fetch, () => clock)
    const first = await feed.forToken(a.output.token)
    expect(previewCalendar(first.text)).toHaveLength(4)
    const other = await store.saveOutput(a.owner, { name: 'Other', sources: a.selected })
    await feed.forToken((await store.requireOutput(a.owner, other.id)).token)
    expect(fetch).toHaveBeenCalledTimes(1)
    clock += cachePolicy.freshMs + 1
    fetch.mockRejectedValueOnce(new FetchError('The calendar provider took too long to respond.'))
    const stale = await feed.forToken(a.output.token)
    expect(stale.health[0]?.status).toBe('stale')
    expect(previewCalendar(stale.text)).toHaveLength(4)
    await feed.forToken(a.output.token)
    expect(fetch).toHaveBeenCalledTimes(2)
    const restarted = connectDatabase(databaseURL)
    try {
      const persisted = await createFeedService(restarted.db, fetch, () => clock).forToken(
        a.output.token,
      )
      expect(previewCalendar(persisted.text)).toHaveLength(4)
      expect(fetch).toHaveBeenCalledTimes(2)
    } finally {
      await restarted.close()
    }
    clock += cachePolicy.retryMs + 1
    fetch.mockResolvedValueOnce(empty)
    const recovered = await feed.forToken(a.output.token)
    expect(recovered.health[0]?.status).toBe('healthy')
    expect(previewCalendar(recovered.text)).toHaveLength(0)
  })
  it('handles partial failure, retryable absence, invalid tokens and disabled or removed sources', async () => {
    const a = await setup(2)
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(fixture)
      .mockRejectedValueOnce(new FetchError('Could not connect to the calendar provider.'))
    const feed = createFeedService(db, fetch)
    const partial = await feed.forToken(a.output.token)
    expect(previewCalendar(partial.text)).toHaveLength(4)
    expect(partial.health.map((source) => source.status).sort()).toEqual(['healthy', 'unavailable'])
    await expect(feed.forToken('bad-token')).rejects.toThrow('not found')
    await expect(feed.preview(await owner(), a.output.id)).rejects.toThrow('not found')
    const [healthy] = await db
      .select()
      .from(sources)
      .where(eq(sources.id, partial.health.find((source) => source.status === 'healthy')!.id))
    await store.saveSource(a.owner, {
      id: healthy!.id,
      name: healthy!.name,
      url: healthy!.url,
      enabled: false,
    })
    await expect(feed.forToken(a.output.token)).rejects.toThrow('No selected source')
    await store.removeSource(
      a.owner,
      partial.health.find((source) => source.status === 'unavailable')!.id,
    )
    expect(previewCalendar((await feed.forToken(a.output.token)).text)).toEqual([])
  })
  it('bounds simultaneous upstream work and prevents a stale in-flight result from overwriting an edited source', async () => {
    const a = await setup(9)
    let active = 0
    let peak = 0
    const fetch = vi.fn(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 12))
      active--
      return fixture
    })
    await createFeedService(db, fetch).forToken(a.output.token)
    expect(peak).toBeLessThanOrEqual(4)
    expect(fetch).toHaveBeenCalledTimes(9)
    const b = await setup()
    let complete!: (value: string) => void
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const feed = createFeedService(db, async () => {
      started()
      return await new Promise<string>((resolve) => {
        complete = resolve
      })
    })
    const pending = feed.forToken(b.output.token)
    await ready
    await store.saveSource(b.owner, {
      id: b.selected[0]!.sourceId,
      name: 'Changed',
      url: 'https://changed.test/feed',
      enabled: true,
    })
    complete(fixture)
    await expect(pending).rejects.toThrow('No selected source')
    const [source] = await db.select().from(sources).where(eq(sources.id, b.selected[0]!.sourceId))
    expect(source?.snapshot).toBeNull()
  })
  it('retains good data for malformed responses and redacts credentials before retaining a snapshot', async () => {
    const a = await setup()
    let clock = Date.now()
    const fetch = vi.fn(async () =>
      fixture.replace(
        'X-TEAM:Blue',
        'X-SUBSCRIPTION:https://provider.test/anything?token=secret-credential',
      ),
    )
    const feed = createFeedService(db, fetch, () => clock)
    await feed.forToken(a.output.token)
    const [saved] = await db.select().from(sources).where(eq(sources.id, a.selected[0]!.sourceId))
    expect(saved?.snapshot).not.toContain('secret-credential')
    clock += cachePolicy.freshMs + 1
    fetch.mockResolvedValueOnce('bad calendar')
    const stale = await feed.forToken(a.output.token)
    expect(stale.health[0]?.status).toBe('stale')
    expect(stale.health[0]?.error).toContain('valid iCalendar')
    expect(previewCalendar(stale.text)).toHaveLength(4)
  })
})

describe('browser escape hatch', () => {
  it('persists the setting, invalidates freshness on edits and uses the same durable cache', async () => {
    const a = await setup()
    const sourceId = a.selected[0]!.sourceId
    const original = (await store.list(a.owner)).sources[0]!
    expect(original.useBrowser).toBe(false)
    const fetch = vi.fn(async () => fixture)
    let clock = Date.now()
    const feed = createFeedService(db, fetch, () => clock)
    await feed.forToken(a.output.token)
    await store.saveSource(a.owner, { ...original, useBrowser: true })
    expect((await store.list(a.owner)).sources[0]?.useBrowser).toBe(true)
    await feed.checkSource(a.owner, sourceId)
    expect(fetch).toHaveBeenLastCalledWith(original.url, { useBrowser: true })
    await feed.forToken(a.output.token)
    expect(fetch).toHaveBeenCalledTimes(2)
    clock += cachePolicy.freshMs + 1
    fetch.mockRejectedValueOnce(new FetchError('Browser timed out.'))
    const stale = await feed.forToken(a.output.token)
    expect(stale.health[0]?.status).toBe('stale')
    expect(previewCalendar(stale.text)).toHaveLength(4)
  })
  it('does not reclaim a browser fetch after the normal 15-second lease expires', async () => {
    const a = await setup()
    const original = (await store.list(a.owner)).sources[0]!
    await store.saveSource(a.owner, { ...original, useBrowser: true })
    let clock = Date.now()
    let finish!: (value: string) => void
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const fetch = vi.fn(() => {
      started()
      return new Promise<string>((resolve) => {
        finish = resolve
      })
    })
    const first = createFeedService(db, fetch, () => clock).checkSource(a.owner, original.id)
    await ready
    clock += 20_000
    await createFeedService(db, fetch, () => clock).checkSource(a.owner, original.id)
    expect(fetch).toHaveBeenCalledTimes(1)
    finish(fixture)
    await first
  })
})
