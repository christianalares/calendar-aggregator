import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Brand } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { CalendarDashboard } from '../components/dashboard'
import { Invites } from '../components/invites'
import { authClient } from '../lib/auth-client'
import { queryOptions } from '../queries'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.query(queryOptions.auth.currentUser())

    if (!user) {
      context.queryClient.clear()
      throw redirect({ to: '/login' })
    }
  },
  component: Dashboard,
})

function Dashboard() {
  const userQuery = useQuery(queryOptions.auth.currentUser())
  const client = useQueryClient()
  const navigate = useNavigate()
  const signOutMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.signOut()

      if (result.error) {
        throw new Error('Could not sign out. Please try again.')
      }
    },
    onSuccess: async () => {
      client.clear()
      await navigate({ to: '/login' })
    },
  })
  useEffect(() => {
    if (userQuery.isError || (userQuery.isSuccess && !userQuery.data)) {
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
    }
  }, [userQuery.isError, userQuery.isSuccess, userQuery.data, client])

  if (userQuery.isError || (userQuery.isSuccess && !userQuery.data)) {
    return (
      <main className="page-shell space-y-4 py-8">
        <h1>Please sign in again</h1>
        <p>We could not confirm your account.</p>
        <Button onClick={() => navigate({ to: '/login' })}>Go to sign in</Button>
      </main>
    )
  }

  if (!userQuery.data) {
    return (
      <main className="page-shell space-y-4 py-8">
        <p>Checking your account...</p>
      </main>
    )
  }

  const user = userQuery.data

  return (
    <>
      <header className="border-b bg-card">
        <div className="page-shell flex h-16 items-center justify-between gap-3">
          <Brand />
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.name}</span>
            <ThemeToggle />
            <Button
              variant="ghost"
              disabled={signOutMutation.isPending}
              onClick={() => signOutMutation.mutate()}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="page-shell space-y-8 py-7 sm:py-8">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">
            All together, at last.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your calendars, sources, and shared links. One happy place.
          </p>
        </div>
        {signOutMutation.error && (
          <p role="alert" className="text-sm text-destructive">
            {signOutMutation.error.message}
          </p>
        )}
        <CalendarDashboard ownerId={user.id} baseURL={user.baseURL} />
        {user.role === 'operator' && <Invites ownerId={user.id} baseURL={user.baseURL} />}
        <footer className="border-t pt-5 text-center text-xs text-muted-foreground">
          CalPal · A little less calendar juggling.
        </footer>
      </main>
    </>
  )
}
