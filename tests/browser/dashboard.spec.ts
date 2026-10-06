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
  members,
  sources,
} from '../../packages/db/src/index'

const connection = connectDatabase(process.env.TEST_DATABASE_URL!)
const { db } = connection
const store = createCalendarStore(db)
test.afterAll(() => connection.close())

async function sessionCookie(admitted: boolean) {
  const id = randomUUID()
  const token = randomBytes(32).toString('hex')
  await db
    .insert(authUsers)
    .values({ id, name: 'Other identity', email: `${id}@example.test`, emailVerified: true })
  if (admitted) {
    await db.insert(members).values({ userId: id, role: 'member' })
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
  await page.getByRole('button', { name: '+ Add source' }).click()
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
  await page.getByRole('button', { name: '+ Create calendar' }).click()
  await page.getByLabel('Calendar name').fill('Our week')
  await page.getByLabel('Football', { exact: true }).check()
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
  await page.getByRole('button', { name: 'Preview events ↓' }).click()
  await expect(page.getByText('⚽ Fotboll', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Create invite', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Invitation URL' })).toBeVisible()
  const memberInvite = await request.post(savedRequest.url(), {
    headers: { ...headers, cookie: await sessionCookie(true) },
    data: savedRequest.postData(),
  })
  expect(await memberInvite.text()).toContain('Only the operator can create invitations')
  await page.getByRole('button', { name: 'Revoke', exact: true }).click()
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Replace link', exact: true }).click()
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
