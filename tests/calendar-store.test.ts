import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createCalendarStore } from '../apps/web/src/server/calendar-store'
import { cachePolicy, createFeedService } from '../apps/web/src/server/feeds'
import { previewCalendar } from '../apps/web/src/server/ical'
import { FetchError } from '../apps/web/src/server/upstream'
import { authUsers, connectDatabase, members, sources } from '../packages/db/src/index'

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
