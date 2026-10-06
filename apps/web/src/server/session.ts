import '@tanstack/react-start/server-only'
import { members } from '@calendar-aggregator/db'
import { eq } from 'drizzle-orm'
import { auth } from './auth'
import { db } from './database'

export async function admittedSession(headers: Headers) {
  try {
    const session = await auth.api.getSession({ headers })
    if (!session) {
      return null
    }
    const [member] = await db.select().from(members).where(eq(members.userId, session.user.id))

    return member ? { member, user: session.user } : null
  } catch {
    throw new Error('Could not confirm your account. Please try again.')
  }
}
