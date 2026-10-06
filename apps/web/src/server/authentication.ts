import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  type Database,
  invitations,
} from '@calendar-aggregator/db'
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware, getOAuthState } from 'better-auth/api'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { admitIdentity } from './admission'

const invitationState = z.object({
  invitation: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
})

export function createAuthentication(
  db: Database,
  config: {
    baseURL: string
    secret: string
    operatorEmail?: string
    google?: { clientId: string; clientSecret: string }
  },
) {
  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    logger: { disabled: true },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    socialProviders: config.google ? { google: config.google } : {},
    onAPIError: { errorURL: `${config.baseURL}/login` },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!user.emailVerified) {
              throw new APIError('FORBIDDEN', { message: 'A verified Google account is required.' })
            }

            if (
              config.operatorEmail &&
              user.email.toLowerCase() === config.operatorEmail.toLowerCase()
            ) {
              return
            }

            const state = invitationState.safeParse(await getOAuthState())
            const token = state.success ? state.data.invitation : undefined
            const [invite] = token
              ? await db
                  .select({ id: invitations.id })
                  .from(invitations)
                  .where(
                    and(
                      eq(invitations.token, token),
                      isNull(invitations.usedAt),
                      isNull(invitations.revokedAt),
                    ),
                  )
                  .limit(1)
              : []

            if (!invite) {
              throw new APIError('FORBIDDEN', {
                message: 'An unused invitation is required to join.',
              })
            }
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/callback/:id' || !ctx.context.newSession) {
          return
        }

        const state = invitationState.safeParse(await getOAuthState())

        try {
          await admitIdentity(
            db,
            ctx.context.newSession.user.id,
            state.success ? state.data.invitation : undefined,
            config.operatorEmail,
          )
        } catch {
          throw new APIError('FORBIDDEN', {
            message: 'Could not join. The invitation may have been used or revoked.',
          })
        }
      }),
    },
    plugins: [tanstackStartCookies()],
  })
}
