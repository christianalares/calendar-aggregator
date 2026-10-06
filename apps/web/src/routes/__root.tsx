import { type QueryClient, QueryErrorResetBoundary } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'
import { AlertProvider } from '@/components/alerts'
import { ModalProvider } from '@/components/modals'
import { SheetProvider } from '@/components/sheets'
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
    title: 'CalPal',
  }),
  shellComponent: ({ children }: { children: ReactNode }) => {
    return (
      <html lang="en" suppressHydrationWarning>
        <head>
          <HeadContent />
        </head>
        <body>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryErrorResetBoundary>
              {children}
              <ModalProvider />
              <SheetProvider />
              <AlertProvider />
            </QueryErrorResetBoundary>
          </ThemeProvider>
          <Scripts />
        </body>
      </html>
    )
  },
})
