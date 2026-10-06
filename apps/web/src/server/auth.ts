import '@tanstack/react-start/server-only'
import { env } from '../env.server'
import { createAuthentication } from './authentication'
import { db } from './database'

export const auth = createAuthentication(db, {
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  operatorEmail: env.OPERATOR_GOOGLE_EMAIL,
  google:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
      : undefined,
})
