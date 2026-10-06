import { randomBytes, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { admitIdentity } from '../apps/web/src/server/admission'
import { authUsers, connectDatabase, invitations, members } from '../packages/db/src/index'

const testURL = z.url().parse(process.env.TEST_DATABASE_URL)
const parsedURL = new URL(testURL)

if (parsedURL.hostname !== '127.0.0.1' || !parsedURL.pathname.endsWith('_test')) {
  throw new Error('Admission tests require an isolated local test database.')
}

const connection = connectDatabase(testURL)
const { db } = connection
const operatorId = randomUUID()
const operatorEmail = `${operatorId}@example.test`

async function identity(verified = true) {
  const id = randomUUID()
  await db
    .insert(authUsers)
    .values({ id, name: 'Invited friend', email: `${id}@example.test`, emailVerified: verified })

  return id
}

async function invitation() {
  const token = randomBytes(32).toString('hex')
  await db.insert(invitations).values({ id: randomUUID(), creatorId: operatorId, token })

  return token
}

beforeAll(async () => {
  await db
    .insert(authUsers)
    .values({ id: operatorId, name: 'Operator', email: operatorEmail, emailVerified: true })
  await admitIdentity(db, operatorId, undefined, operatorEmail)
})
afterAll(async () => {
  await connection.close()
})

describe('invite-only admission against PostgreSQL', () => {
  it('only bootstraps the explicitly configured verified operator identity', async () => {
    const [member] = await db.select().from(members).where(eq(members.userId, operatorId))
    expect(member?.role).toBe('operator')
    await expect(admitIdentity(db, await identity(), undefined, operatorEmail)).rejects.toThrow(
      'invitation',
    )
    await expect(
      admitIdentity(db, await identity(false), await invitation(), operatorEmail),
    ).rejects.toThrow('verified')
  })

  it('admits exactly one of two concurrent identities with the same invitation', async () => {
    const token = await invitation()
    const first = await identity()
    const second = await identity()
    const results = await Promise.allSettled([
      admitIdentity(db, first, token, operatorEmail),
      admitIdentity(db, second, token, operatorEmail),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const [invite] = await db.select().from(invitations).where(eq(invitations.token, token))
    expect([first, second]).toContain(invite?.usedBy)
    expect(invite?.usedAt).toBeInstanceOf(Date)
  })

  it('does not consume a fresh invitation when an established account signs in', async () => {
    const token = await invitation()
    await admitIdentity(db, operatorId, token, operatorEmail)
    const [invite] = await db.select().from(invitations).where(eq(invitations.token, token))
    expect(invite?.usedAt).toBeNull()
  })

  it('rejects revoked links and leaves unused links usable after failed admission', async () => {
    const token = await invitation()
    const unverified = await identity(false)
    await expect(admitIdentity(db, unverified, token, operatorEmail)).rejects.toThrow()
    const [unused] = await db.select().from(invitations).where(eq(invitations.token, token))
    expect(unused?.usedAt).toBeNull()
    await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.token, token))
    await expect(admitIdentity(db, await identity(), token, operatorEmail)).rejects.toThrow(
      'revoked',
    )
  })

  it('serializes repeated admission of one identity without spending two invitations', async () => {
    const user = await identity()
    const first = await invitation()
    const second = await invitation()
    await Promise.all([
      admitIdentity(db, user, first, operatorEmail),
      admitIdentity(db, user, second, operatorEmail),
    ])
    const rows = await db.select().from(invitations).where(eq(invitations.usedBy, user))
    expect(rows).toHaveLength(1)
  })
})
