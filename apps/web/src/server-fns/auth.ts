import { invitations } from '@calendar-aggregator/db'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { env } from '../env.server'
import { db } from '../server/database'
import { admittedSession } from '../server/session'

export const currentUser = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await admittedSession(getRequestHeaders())

  return session
    ? {
        name: session.user.name,
        email: session.user.email,
        role: session.member.role,
        id: session.member.userId,
        baseURL: env.APP_URL.replace(/\/$/, ''),
      }
    : null
})

export const signInStatus = createServerFn({ method: 'GET' })
  .validator(z.object({ invitation: z.string().optional() }))
  .handler(async ({ data }) => {
    let invitationAvailable = false

    if (data.invitation && /^[a-f0-9]{64}$/.test(data.invitation)) {
      try {
        const [invite] = await db
          .select({ id: invitations.id })
          .from(invitations)
          .where(
            and(
              eq(invitations.token, data.invitation),
              isNull(invitations.usedAt),
              isNull(invitations.revokedAt),
            ),
          )
          .limit(1)
        invitationAvailable = Boolean(invite)
      } catch {
        throw new Error('Could not check the invitation. Please try again.')
      }
    }

    return { configured: Boolean(env.GOOGLE_CLIENT_ID), invitationAvailable }
  })
