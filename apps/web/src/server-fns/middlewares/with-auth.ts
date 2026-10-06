import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { admittedSession } from '../../server/session'

export const withAuthMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await admittedSession(getRequestHeaders())
    if (!session) {
      throw new Error('Sign in to continue.')
    }

    return await next({ context: session })
  },
)
