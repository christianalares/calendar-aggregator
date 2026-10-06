import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { eq } from 'drizzle-orm'
import { createCalendarStore } from '../../apps/web/src/server/calendar-store'
import { parseCalendar } from '../../apps/web/src/server/ical'
import {
  authSessions,
  authUsers,
  connectDatabase,
  invitations,
  members,
  sources,
} from '../../packages/db/src/index'

const connection = connectDatabase(process.env.TEST_DATABASE_URL!)
const { db } = connection
const store = createCalendarStore(db)
test.afterAll(() => connection.close())

async function sessionCookie(
  admitted: boolean,
  role: 'member' | 'operator' = 'member',
  id = randomUUID(),
) {
  const token = randomBytes(32).toString('hex')
  await db
    .insert(authUsers)
    .values({ id, name: 'Other identity', email: `${id}@example.test`, emailVerified: true })
  if (admitted) {
    await db.insert(members).values({ userId: id, role })
  }
  await db
    .insert(authSessions)
    .values({ id: randomUUID(), userId: id, token, expiresAt: new Date(Date.now() + 3_600_000) })
  const signature = createHmac('sha256', process.env.BETTER_AUTH_SECRET!)
    .update(token)
    .digest('base64')

  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`
}

test('owner dashboard, failed save recovery, invitations, feed access and rotation', async ({
  page,
  context,
  request,
}, testInfo) => {
  const errors: string[] = []
  let savedRequest: import('@playwright/test').Request | undefined
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/_serverFn/')) {
      savedRequest = request
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
  const ownerId = randomUUID()
  const token = randomBytes(32).toString('hex')
  await db.insert(authUsers).values({
    id: ownerId,
    name: 'Christian',
    email: `${ownerId}@example.test`,
    emailVerified: true,
  })
  await db.insert(members).values({ userId: ownerId, role: 'operator' })
  await db.insert(authSessions).values({
    id: randomUUID(),
    userId: ownerId,
    token,
    expiresAt: new Date(Date.now() + 60_000 * 60),
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
  const anonymous = await request.get('/')
  expect(anonymous.url()).toContain('/login')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'All together, at last.' })).toBeVisible()
  // Registered dialogs must restore focus and reset form state when reopened.
  const addSource = page.getByRole('button', { name: 'Add source', exact: true })
  await addSource.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused()
  await page.getByLabel('Name', { exact: true }).fill('Unsaved source')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(addSource).toBeFocused()
  await page.getByRole('button', { name: 'Add source', exact: true }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
  await page.getByLabel('Name', { exact: true }).fill('Football')
  await page
    .getByLabel('Calendar subscription URL')
    .fill('https://provider.test/secret-calendar-token.ics')
  let failed = false
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST' && !failed) {
      failed = true
      await route.abort('failed')
      return
    }
    await route.continue()
  })
  await page.getByRole('button', { name: 'Save source', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Football')
  await expect(page.getByLabel('Calendar subscription URL')).toHaveValue(
    'https://provider.test/secret-calendar-token.ics',
  )
  await page.getByRole('button', { name: 'Save source', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(failed).toBe(true)
  await page.unroute('**/_serverFn/**')
  if (!savedRequest) {
    throw new Error('Missing server-function request.')
  }
  const headers = { ...savedRequest.headers() }
  delete headers.cookie
  delete headers['content-length']
  const rejected = await request.post(savedRequest.url(), {
    headers,
    data: savedRequest.postData(),
  })
  expect(await rejected.text()).toContain('Sign in to continue')
  const nonMember = await request.post(savedRequest.url(), {
    headers: { ...headers, cookie: await sessionCookie(false) },
    data: savedRequest.postData(),
  })
  expect(await nonMember.text()).toContain('Sign in to continue')
  expect((await store.list(ownerId)).sources).toHaveLength(1)
  const csrfResponse = await request.post(savedRequest.url(), {
    headers: { ...headers, origin: 'https://evil.test', 'sec-fetch-site': 'cross-site' },
    data: savedRequest.postData(),
  })
  expect(csrfResponse.status()).toBe(403)
  await page.getByRole('button', { name: 'Actions for source Football' }).click()
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Football')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Actions for source Football' })).toBeFocused()
  await page.getByRole('button', { name: 'Actions for source Football' }).click()
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Create calendar', exact: true }).click()
  await page.getByLabel('Calendar name').fill('Our week')
  await page.getByRole('checkbox', { name: 'Football', exact: true }).check()
  await page.getByLabel('Prefix for Football').fill('⚽')
  await page.getByRole('button', { name: 'Save calendar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Our week', exact: true })).toBeVisible()
  const saved = await store.list(ownerId)
  const source = saved.sources[0]!
  await db
    .update(sources)
    .set({
      snapshot: readFileSync(new URL('../fixtures/complex.ics', import.meta.url), 'utf8'),
      lastSuccessAt: new Date(),
      nextFetchAt: new Date(Date.now() + 900_000),
    })
    .where(eq(sources.id, source.id))
  const url = await page
    .getByRole('textbox', { name: 'Subscription URL', exact: true })
    .inputValue()
  const feed = await request.get(url)
  expect(feed.headers()['cache-control']).toBe('no-store')
  expect(feed.status()).toBe(200)
  expect(feed.headers()['content-type']).toContain('text/calendar')
  expect(parseCalendar(await feed.text()).getAllSubcomponents('vevent')).toHaveLength(4)
  await page.getByRole('button', { name: 'Preview events', exact: true }).click()
  await expect(page.getByText('⚽ Fotboll', { exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'All entries', exact: true }).click()
  await expect(page.getByText('⚽ Later football', { exact: true })).toBeVisible()
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible()
  expect(
    await page
      .getByRole('dialog')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('calendar-preview.png'), fullPage: true })
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /October 10/ })
    .click()
  await expect(page.getByText('⚽ Weekend away', { exact: true })).toBeVisible()
  await expect(page.getByText('⚽ Fotboll', { exact: true })).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Create invite', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Invitation URL' })).toBeVisible()
  const memberInvite = await request.post(savedRequest.url(), {
    headers: { ...headers, cookie: await sessionCookie(true) },
    data: savedRequest.postData(),
  })
  expect(await memberInvite.text()).toContain('Only the operator can create invitations')
  await page.getByRole('button', { name: 'Revoke', exact: true }).click()
  const revokeDialog = page.getByRole('alertdialog')
  await expect(revokeDialog).toBeVisible()
  await revokeDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Invitation URL' })).toBeVisible()
  await page.getByRole('button', { name: 'Revoke', exact: true }).click()
  await revokeDialog.getByRole('button', { name: 'Revoke invitation', exact: true }).click()
  await expect(revokeDialog).toHaveCount(0)
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'Actions for calendar Our week' }).click()
  await page.getByRole('menuitem', { name: 'Replace link', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Replace link', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect
    .poll(() => page.getByRole('textbox', { name: 'Subscription URL', exact: true }).inputValue())
    .not.toBe(url)
  expect((await request.get(url)).status()).toBe(404)
  const newURL = await page
    .getByRole('textbox', { name: 'Subscription URL', exact: true })
    .inputValue()
  expect((await request.get(newURL)).status()).toBe(200)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  expect(errors).toEqual([])
})

test('eight calendars, source health, invite table and persistent appearance', async ({
  page,
  context,
}, testInfo) => {
  const ownerId = randomUUID()
  const cookie = await sessionCookie(true, 'operator', ownerId)
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: cookie.slice(cookie.indexOf('=') + 1),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  const names = ['Padel Royale', 'Family events', 'Work meetings', 'Training']
  const sourceIds: string[] = []
  for (const [index, name] of names.entries()) {
    const { id } = await store.saveSource(ownerId, {
      name,
      url: `https://provider.test/${index}/calendar-subscription.ics`,
      enabled: index !== 3,
    })
    sourceIds.push(id)
    await db
      .update(sources)
      .set({
        lastAttemptAt: new Date('2026-10-06T12:20:00Z'),
        lastSuccessAt: index < 2 ? new Date('2026-10-06T12:00:00Z') : null,
        lastError:
          index === 1
            ? 'Latest fetch failed. Previous data is retained.'
            : index === 2
              ? 'Could not reach the source.'
              : null,
      })
      .where(eq(sources.id, id))
  }
  for (const [index, name] of [
    'Padel',
    'Family',
    'Work',
    'Training',
    'School',
    'Trips',
    'Community',
    'Personal',
  ].entries()) {
    await store.saveOutput(ownerId, {
      name,
      sources: [
        { sourceId: sourceIds[index % 4]!, prefix: '' },
        { sourceId: sourceIds[(index + 1) % 4]!, prefix: '' },
      ],
    })
  }
  const friendId = randomUUID()
  await db.insert(authUsers).values({
    id: friendId,
    name: 'A pal',
    email: `pal-${friendId}@example.test`,
    emailVerified: true,
  })
  await db.insert(invitations).values([
    { id: randomUUID(), creatorId: ownerId, token: randomBytes(32).toString('hex') },
    {
      id: randomUUID(),
      creatorId: ownerId,
      token: randomBytes(32).toString('hex'),
      usedAt: new Date(),
      usedBy: friendId,
    },
    {
      id: randomUUID(),
      creatorId: ownerId,
      token: randomBytes(32).toString('hex'),
      revokedAt: new Date(),
    },
  ])
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Personal', exact: true })).toBeVisible()
  await expect(
    page.getByRole('table', { name: 'Sources', exact: true }).getByRole('row'),
  ).toHaveCount(5)
  for (const status of ['Healthy', 'Using older data', 'Unavailable', 'Disabled'])
    await expect(page.getByText(status, { exact: true })).toBeVisible()
  await expect(
    page.getByRole('table', { name: 'Invites', exact: true }).getByRole('row'),
  ).toHaveCount(4)
  await expect(page.getByText(`pal-${friendId}@example.test`, { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Subscription URL', exact: true })).toHaveCount(8)
  const healthyColor = await page
    .getByText('Healthy', { exact: true })
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  const disabledColor = await page
    .getByText('Disabled', { exact: true })
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(healthyColor).not.toBe(disabledColor)
  const grid = page.getByTestId('calendar-grid')
  const columns = () =>
    grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  if (testInfo.project.name === 'desktop') {
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect.poll(columns).toBe(3)
    await page.screenshot({
      path: testInfo.outputPath('eight-calendars-light.png'),
      fullPage: true,
    })
    await page.setViewportSize({ width: 800, height: 900 })
    await expect.poll(columns).toBe(2)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(columns).toBe(1)
    await page.setViewportSize({ width: 1280, height: 900 })
  } else {
    await expect.poll(columns).toBe(1)
    await page.screenshot({
      path: testInfo.outputPath('eight-calendars-light.png'),
      fullPage: true,
    })
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveClass('dark')
  await page.reload()
  await expect(page.locator('html')).toHaveClass('dark')
  await expect(page.getByRole('heading', { name: 'Padel', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('eight-calendars-dark.png'), fullPage: true })
})
