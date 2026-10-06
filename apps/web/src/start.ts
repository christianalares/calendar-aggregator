import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'

const privateResponses = createMiddleware().server(async ({ next }) => {
  setResponseHeader('Cache-Control', 'no-store')
  setResponseHeader('Referrer-Policy', 'no-referrer')
  setResponseHeader('X-Content-Type-Options', 'nosniff')
  setResponseHeader('X-Robots-Tag', 'noindex, nofollow')

  return await next()
})
const csrf = createCsrfMiddleware({ filter: (context) => context.handlerType === 'serverFn' })

export const startInstance = createStart(() => ({ requestMiddleware: [privateResponses, csrf] }))
