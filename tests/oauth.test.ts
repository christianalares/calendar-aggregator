import { randomBytes, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, expect, it } from 'vitest'
import { z } from 'zod'
import { createAuthentication } from '../apps/web/src/server/authentication'
import { authUsers, connectDatabase, invitations, members } from '../packages/db/src/index'

const url = z.url().parse(process.env.TEST_DATABASE_URL)

if (new URL(url).hostname !== '127.0.0.1' || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('OAuth tests require an isolated local test database.')
}

const connection = connectDatabase(url)
const { db } = connection
const origin = 'http://localhost:3000'
const operatorEmail = `${randomUUID()}@example.test`
const auth = createAuthentication(db, {
  baseURL: origin,
  secret: 'a-test-only-secret-with-at-least-thirty-two-characters',
  operatorEmail,
  google: { clientId: 'test-client', clientSecret: 'test-secret' },
})

afterAll(async () => {
  await connection.close()
})

async function start(invitation?: string) {
  const response = await auth.handler(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        provider: 'google',
        callbackURL: '/',
        additionalData: { invitation },
      }),
    }),
  )
  expect(response.status).toBe(200)
  const data = z.object({ url: z.url() }).parse(await response.json())
  const state = new URL(data.url).searchParams.get('state')
  expect(state).toBeTruthy()

  return {
    state: state ?? '',
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
  }
}

async function providerIdentity(email: string) {
  const context = await auth.$context

  for (const candidate of context.socialProviders) {
    const provider = candidate

    if (provider.id === 'google') {
      // Substitute only the external provider boundary; actual OAuth state, hooks,
      // sessions, adapter and database admission remain under test.
      provider.validateAuthorizationCode = async () => ({
        accessToken: 'fixture-token',
        scopes: ['openid', 'email'],
      })
      provider.getUserInfo = async () => ({
        user: { sub: email, email, emailVerified: true, name: 'Calendar friend' },
        data: { sub: email, email, email_verified: true },
      })
    }
  }
}

async function callback(flow: Awaited<ReturnType<typeof start>>, cancel = false) {
  const query = new URLSearchParams({
    state: flow.state,
    ...(cancel ? { error: 'access_denied' } : { code: 'fixture-code' }),
  })

  return await auth.handler(
    new Request(`${origin}/api/auth/callback/google?${query}`, {
      headers: { cookie: flow.cookie },
    }),
  )
}

it('runs real Google callback hooks and session creation, with invite-only admission', async () => {
  await providerIdentity(operatorEmail)
  const operatorResponse = await callback(await start())
  expect(operatorResponse.status).toBe(302)
  const [operator] = await db.select().from(authUsers).where(eq(authUsers.email, operatorEmail))
  expect(operator).toBeTruthy()

  if (!operator) {
    throw new Error('Operator was not provisioned.')
  }

  const [operatorMember] = await db.select().from(members).where(eq(members.userId, operator.id))
  expect(operatorMember?.role).toBe('operator')

  const token = randomBytes(32).toString('hex')
  await db.insert(invitations).values({ id: randomUUID(), creatorId: operator.id, token })
  const invitedEmail = `${randomUUID()}@example.test`
  await providerIdentity(invitedEmail)
  const cancelled = await callback(await start(token), true)
  expect(cancelled.status).toBe(302)
  const [unused] = await db.select().from(invitations).where(eq(invitations.token, token))
  expect(unused?.usedAt).toBeNull()

  const joined = await callback(await start(token))
  expect(joined.status).toBe(302)
  const [invite] = await db.select().from(invitations).where(eq(invitations.token, token))
  expect(invite?.usedAt).toBeInstanceOf(Date)
  expect(
    joined.headers.getSetCookie().some((cookie) => cookie.startsWith('better-auth.session_token=')),
  ).toBe(true)

  const secondToken = randomBytes(32).toString('hex')
  await db
    .insert(invitations)
    .values({ id: randomUUID(), creatorId: operator.id, token: secondToken })
  await callback(await start(secondToken))
  const [stillUnused] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, secondToken))
  expect(stillUnused?.usedAt).toBeNull()

  const rejectedEmail = `${randomUUID()}@example.test`
  await providerIdentity(rejectedEmail)
  await callback(await start(token))
  const rejected = await db.select().from(authUsers).where(eq(authUsers.email, rejectedEmail))
  expect(rejected).toHaveLength(0)
})
