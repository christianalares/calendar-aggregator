import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { eq } from 'drizzle-orm'
import { createCalendarStore } from '../../apps/web/src/server/calendar-store'
import { previewCalendar } from '../../apps/web/src/server/ical'
import {
  authSessions,
  authUsers,
  connectDatabase,
  members,
  sources,
} from '../../packages/db/src/index'

const connection = connectDatabase(process.env.TEST_DATABASE_URL!)
const { db } = connection
const store = createCalendarStore(db)
test.afterAll(() => connection.close())

function snapshot() {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//EN',
    ...['Training', 'Team lunch', 'TRAINING camp', 'Weekend away'].flatMap((title, index) => [
      'BEGIN:VEVENT',
      `UID:example-${index}`,
      'DTSTAMP:20261007T080000Z',
      `DTSTART:202610${10 + index}T170000Z`,
      `SUMMARY:${title}`,
      'DESCRIPTION:Bring boots',
      'LOCATION:City pitch',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n')
}

test('previews draft exclusions, recovers from failed saves and applies persisted rules to the feed', async ({
  page,
  context,
  request,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const ownerId = randomUUID()
  const token = randomBytes(32).toString('hex')
  await db
    .insert(authUsers)
    .values({ id: ownerId, name: 'Owner', email: `${ownerId}@example.test`, emailVerified: true })
  await db.insert(members).values({ userId: ownerId })
  await db.insert(authSessions).values({
    id: randomUUID(),
    userId: ownerId,
    token,
    expiresAt: new Date(Date.now() + 3_600_000),
  })
  const signature = createHmac('sha256', process.env.BETTER_AUTH_SECRET!)
    .update(token)
    .digest('base64')
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: encodeURIComponent(`${token}.${signature}`),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  const source = await store.saveSource(ownerId, {
    name: 'Football',
    url: 'https://provider.test/fixtures.ics',
    enabled: true,
  })
  const otherSource = await store.saveSource(ownerId, {
    name: 'Work',
    url: 'https://provider.test/work.ics',
    enabled: true,
  })
  for (const id of [source.id, otherSource.id])
    await db
      .update(sources)
      .set({
        snapshot: snapshot(),
        lastSuccessAt: new Date(),
        nextFetchAt: new Date(Date.now() + 900_000),
      })
      .where(eq(sources.id, id))
  const output = await store.saveOutput(ownerId, {
    name: 'Our week',
    sources: [{ sourceId: source.id, prefix: '⚽' }, { sourceId: otherSource.id }],
  })
  const original = await store.requireOutput(ownerId, output.id)
  await page.goto('/')
  const openFilters = async () => {
    await page.getByRole('button', { name: 'Actions for calendar Our week' }).click()
    await page.getByRole('menuitem', { name: 'Event filters', exact: true }).click()
  }
  await openFilters()
  const dialog = page.getByRole('dialog')
  const filters = dialog.getByRole('region', { name: 'Event filters for Football' })
  await expect(filters.getByText('0 of 4 entries will be filtered out · 4 kept')).toBeVisible()
  await filters.getByRole('button', { name: 'Add filter', exact: true }).click()
  const match = filters.getByLabel('Text to match for filter 1')
  await expect(dialog.getByRole('button', { name: 'Save filters' })).toBeDisabled()
  await match.fill('training')
  await expect(filters.getByText('2 of 4 entries will be filtered out · 2 kept')).toBeVisible()
  await expect(filters.getByText('Training', { exact: true })).toBeVisible()
  await expect(filters.getByText('TRAINING camp', { exact: true })).toBeVisible()
  expect((await store.list(ownerId)).outputs[0]!.sources[0]!.eventFilters).toEqual([])
  await filters.getByRole('checkbox', { name: 'Match case for filter 1' }).check()
  await expect(filters.getByText('0 of 4 entries will be filtered out · 4 kept')).toBeVisible()
  await filters.getByRole('checkbox', { name: 'Match case for filter 1' }).uncheck()
  await filters.getByLabel('Match for filter 1', { exact: true }).selectOption('equals')
  await expect(filters.getByText('1 of 4 entries will be filtered out · 3 kept')).toBeVisible()
  await filters.getByLabel('Event field for filter 1').selectOption('location')
  await match.fill('City pitch')
  await expect(filters.getByText('4 of 4 entries will be filtered out · 0 kept')).toBeVisible()
  await filters.getByLabel('Event field for filter 1').selectOption('title')
  await filters.getByLabel('Match for filter 1', { exact: true }).selectOption('contains')
  await match.fill('training')
  await expect(filters.getByText('2 of 4 entries will be filtered out · 2 kept')).toBeVisible()
  await dialog.getByRole('button', { name: 'Work', exact: true }).click()
  const workFilters = dialog.getByRole('region', { name: 'Event filters for Work' })
  await expect(workFilters.getByText('0 of 4 entries will be filtered out · 4 kept')).toBeVisible()
  await dialog.getByRole('button', { name: 'Football', exact: true }).click()
  await expect(match).toHaveValue('training')

  mkdirSync('work', { recursive: true })
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: `work/event-filters-${testInfo.project.name}.png`, fullPage: true })

  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST') await route.abort('failed')
    else await route.continue()
  })
  await dialog.getByRole('button', { name: 'Save filters', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(match).toHaveValue('training')
  await page.unroute('**/_serverFn/**')
  await dialog.getByRole('button', { name: 'Save filters', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const current = await store.requireOutput(ownerId, output.id)
  expect(current.token).toBe(original.token)
  const feed = await request.get(`/feed/${current.token}.ics`)
  expect(feed.status()).toBe(200)
  const events = previewCalendar(await feed.text())
  expect(events).toHaveLength(6)
  expect(
    events.filter((event) => event.title.startsWith('⚽')).map((event) => event.title),
  ).toEqual(['⚽ Team lunch', '⚽ Weekend away'])
  await page.reload()
  await openFilters()
  await expect(match).toHaveValue('training')
  await expect(filters.getByText('2 of 4 entries will be filtered out · 2 kept')).toBeVisible()
  await filters.getByRole('checkbox', { name: 'Enable filter 1' }).uncheck()
  await expect(filters.getByText('0 of 4 entries will be filtered out · 4 kept')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await openFilters()
  await expect(filters.getByRole('checkbox', { name: 'Enable filter 1' })).toBeChecked()
  await filters.getByRole('button', { name: 'Delete filter 1' }).click()
  await expect(filters.getByText('0 of 4 entries will be filtered out · 4 kept')).toBeVisible()
  await dialog.getByRole('button', { name: 'Save filters', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(
    previewCalendar(await (await request.get(`/feed/${current.token}.ics`)).text()),
  ).toHaveLength(8)
  expect(errors).toEqual([])
})
