import { type QueryClient, QueryErrorResetBoundary } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import css from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
    links: [{ rel: 'stylesheet', href: css }],
    title: 'Calendar Club',
  }),
  shellComponent: ({ children }: { children: ReactNode }) => {
    return (
      <html lang="en">
        <head>
          <HeadContent />
        </head>
        <body>
          <QueryErrorResetBoundary>{children}</QueryErrorResetBoundary>
          <Scripts />
        </body>
      </html>
    )
  },
})
