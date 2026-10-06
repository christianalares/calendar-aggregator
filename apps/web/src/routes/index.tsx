import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
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
      <main className="container">
        <h1>Please sign in again</h1>
        <p>We could not confirm your account.</p>
        <button type="button" onClick={() => navigate({ to: '/login' })}>
          Go to sign in
        </button>
      </main>
    )
  }

  if (!userQuery.data) {
    return (
      <main className="container">
        <p>Checking your account...</p>
      </main>
    )
  }

  const user = userQuery.data

  return (
    <>
      <header className="app-header">
        <a className="brand" href="/">
          <span className="brand-symbol">▦</span> Calendar Club
        </a>
        <div className="account">
          <span>{user.name}</span>
          <button
            type="button"
            className="text-button"
            disabled={signOutMutation.isPending}
            onClick={() => signOutMutation.mutate()}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="container">
        <div className="welcome">
          <p className="eyebrow">A little less calendar juggling</p>
          <h1>All together, at last.</h1>
          <p>Make room for the things that matter.</p>
        </div>
        {signOutMutation.error && (
          <p role="alert" className="error">
            {signOutMutation.error.message}
          </p>
        )}
        <CalendarDashboard ownerId={user.id} baseURL={user.baseURL} />
        {user.role === 'operator' && <Invites ownerId={user.id} baseURL={user.baseURL} />}
        <footer>Made for a simpler week. Shared with friends.</footer>
      </main>
    </>
  )
}
