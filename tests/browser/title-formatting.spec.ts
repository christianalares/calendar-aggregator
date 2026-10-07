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

function snapshot(titles: string[]) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//EN',
    ...titles.flatMap((title, index) => [
      'BEGIN:VEVENT',
      `UID:example-${index}`,
      'DTSTAMP:20261007T080000Z',
      `DTSTART:202610${10 + index}T170000Z`,
      `SUMMARY:${title.replaceAll(',', '\\,')}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n')
}

test('creates captures in the dashboard, persists combined formatting, and publishes renamed titles', async ({
  page,
  context,
  request,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const ownerId = randomUUID(),
    token = randomBytes(32).toString('hex')
  await db.insert(authUsers).values({
    id: ownerId,
    name: 'Christian',
    email: `${ownerId}@example.test`,
    emailVerified: true,
  })
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
  const football = await store.saveSource(ownerId, {
    name: 'Djurgården fixtures',
    url: 'https://provider.test/football.ics',
    enabled: true,
  })
  const work = await store.saveSource(ownerId, {
    name: 'Rosanna’s work schedule',
    url: 'https://provider.test/work.ics',
    enabled: true,
  })
  for (const [id, titles] of [
    [football.id, ['Djurgården - AIK', 'AIK - Djurgården', 'Training']],
    [work.id, [',', 'Evening shift']],
  ] as const)
    await db
      .update(sources)
      .set({
        snapshot: snapshot([...titles]),
        lastSuccessAt: new Date(),
        lastAttemptAt: new Date(),
        nextFetchAt: new Date(Date.now() + 900_000),
      })
      .where(eq(sources.id, id))
  const output = await store.saveOutput(ownerId, {
    name: 'Our week',
    sources: [
      { sourceId: football.id, prefix: '⚽' },
      { sourceId: work.id, prefix: '' },
    ],
  })
  const original = await store.requireOutput(ownerId, output.id)
  await page.goto('/')
  await page.getByRole('button', { name: 'Title formatting', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const fixtures = dialog.getByRole('region', { name: 'Title formatting for Djurgården fixtures' })
  const shifts = dialog.getByRole('region', {
    name: 'Title formatting for Rosanna’s work schedule',
  })
  await expect(fixtures.getByLabel('Text before title for Djurgården fixtures')).toHaveValue('⚽ ')
  await fixtures.getByRole('button', { name: /Rename rules/ }).click()
  await fixtures.getByRole('button', { name: 'Add rule', exact: true }).click()
  await fixtures.getByLabel('Rule name', { exact: true }).fill('Home matches')
  await fixtures.getByLabel('Show text 1 for Home matches').fill('H: ')
  const sample = fixtures.getByLabel('Try a title', { exact: true })
  await sample.click()
  await page.keyboard.press('End')
  await page.keyboard.down('Shift')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
  await page.keyboard.up('Shift')
  await fixtures.getByRole('button', { name: 'Capture selection', exact: true }).click()
  await fixtures.getByRole('button', { name: 'Edit Text 1 capture', exact: true }).click()
  await page.getByLabel('Capture name', { exact: true }).fill('Opponent')
  await page.keyboard.press('Escape')
  await expect(fixtures.getByText('⚽ H: AIK', { exact: true })).toBeVisible()
  await sample.fill('Djurgården - Malmö FF')
  await expect(fixtures.getByText('⚽ H: Malmö FF', { exact: true })).toBeVisible()
  await sample.fill('AIK - Djurgården')
  await fixtures.getByRole('button', { name: 'Add rule', exact: true }).click()
  await fixtures.getByLabel('Rule name', { exact: true }).fill('Away matches')
  await fixtures.getByLabel('Show text 1 for Away matches').fill('A: ')
  await sample.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.down('Shift')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.up('Shift')
  await fixtures.getByRole('button', { name: 'Capture selection', exact: true }).click()
  await fixtures.getByRole('button', { name: 'Edit Text 1 capture', exact: true }).click()
  await page.getByLabel('Capture name', { exact: true }).fill('Opponent')
  await page.keyboard.press('Escape')
  await expect(fixtures.getByText('⚽ A: AIK', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Rosanna’s work schedule', exact: true }).click()
  await shifts.getByRole('button', { name: /Rename rules/ }).click()
  await shifts.getByRole('button', { name: 'Add rule', exact: true }).click()
  await shifts.getByLabel('Rule name', { exact: true }).fill('Blocked slots')
  await shifts.getByLabel('Show text 1 for Blocked slots').fill('Blockad')
  await expect(shifts.getByText('Blockad', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Save formatting', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Title formatting', exact: true }).click()
  await fixtures.getByRole('button', { name: /Rename rules/ }).click()
  await expect(
    fixtures.getByRole('button', { name: 'Edit Opponent capture', exact: true }),
  ).toBeVisible()
  await expect(fixtures.getByText('⚽ H: AIK', { exact: true })).toBeVisible()
  const current = await store.requireOutput(ownerId, output.id)
  expect(current.token).toBe(original.token)
  const feed = await request.get(`/feed/${current.token}.ics`)
  expect(feed.status()).toBe(200)
  const events = previewCalendar(await feed.text())
  expect(events.map((event) => event.title)).toEqual(
    expect.arrayContaining(['⚽ H: AIK', '⚽ A: AIK', '⚽ Training', 'Blockad', 'Evening shift']),
  )
  await fixtures.getByRole('button', { name: 'Edit rule Away matches', exact: true }).click()
  await sample.fill('AIK - Djurgården')
  await fixtures.getByRole('checkbox', { name: 'Enable Away matches', exact: true }).uncheck()
  await expect(fixtures.getByText('⚽ AIK - Djurgården', { exact: true })).toBeVisible()
  await fixtures.getByRole('checkbox', { name: 'Enable Away matches', exact: true }).check()
  await fixtures.getByRole('button', { name: 'Edit rule Home matches', exact: true }).click()
  await dialog.getByRole('button', { name: 'Rosanna’s work schedule', exact: true }).click()
  await shifts.getByRole('button', { name: /Rename rules/ }).click()
  await expect(shifts.getByText('Blockad', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Djurgården fixtures', exact: true }).click()
  if (testInfo.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 1100 })
  await dialog.evaluate((element) => {
    element.scrollTop = 0
  })
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  mkdirSync('work', { recursive: true })
  await page.screenshot({
    path: `work/title-formatting-dashboard-${testInfo.project.name}.png`,
    fullPage: true,
  })
  expect(errors).toEqual([])
})
