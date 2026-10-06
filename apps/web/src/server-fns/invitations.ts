import { randomBytes, randomUUID } from 'node:crypto'
import { authUsers, invitations } from '@calendar-aggregator/db'
import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { CalendarError } from '../lib/errors'
import { db } from '../server/database'
import { withAuthMiddleware } from './middlewares/with-auth'

async function invitationOperation<T>(callback: () => Promise<T>) {
  try {
    return await callback()
  } catch (error) {
    throw new CalendarError(
      error instanceof CalendarError
        ? error.message
        : 'Could not update invitations. Please try again.',
    )
  }
}

export const listInvitations = createServerFn({ method: 'GET' })
  .middleware([withAuthMiddleware])
  .handler(({ context }) =>
    invitationOperation(async () => {
      if (context.member.role !== 'operator') {
        throw new CalendarError('Only the operator can manage invitations.')
      }

      return await db
        .select({
          id: invitations.id,
          token: invitations.token,
          createdAt: invitations.createdAt,
          usedAt: invitations.usedAt,
          revokedAt: invitations.revokedAt,
          usedBy: authUsers.email,
        })
        .from(invitations)
        .leftJoin(authUsers, eq(authUsers.id, invitations.usedBy))
        .where(eq(invitations.creatorId, context.user.id))
        .orderBy(desc(invitations.createdAt))
    }),
  )

export const createInvitation = createServerFn({ method: 'POST' })
  .middleware([withAuthMiddleware])
  .handler(({ context }) =>
    invitationOperation(async () => {
      if (context.member.role !== 'operator') {
        throw new CalendarError('Only the operator can create invitations.')
      }

      const token = randomBytes(32).toString('hex')
      await db.insert(invitations).values({ id: randomUUID(), creatorId: context.user.id, token })

      return { token }
    }),
  )

export const revokeInvitation = createServerFn({ method: 'POST' })
  .middleware([withAuthMiddleware])
  .validator(z.object({ id: z.uuid() }))
  .handler(({ context, data }) =>
    invitationOperation(async () => {
      if (context.member.role !== 'operator') {
        throw new CalendarError('Only the operator can revoke invitations.')
      }

      const [invite] = await db
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(invitations.id, data.id),
            eq(invitations.creatorId, context.user.id),
            isNull(invitations.usedAt),
            isNull(invitations.revokedAt),
          ),
        )
        .returning({ id: invitations.id })

      if (!invite) {
        throw new CalendarError('The invitation is already used or revoked.')
      }
    }),
  )
