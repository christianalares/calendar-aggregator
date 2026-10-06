import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { authClient } from '../lib/auth-client'
import { queryOptions } from '../queries'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ invitation: z.string().optional(), error: z.string().optional() }),
  loaderDeps: ({ search }) => ({ invitation: search.invitation }),
  loader: ({ context, deps }) =>
    context.queryClient.query(queryOptions.auth.status(deps.invitation)),
  component: Login,
})

function Login() {
  const { invitation, error } = Route.useSearch()
  const { data: status } = useSuspenseQuery(queryOptions.auth.status(invitation))
  const signInMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
        additionalData: invitation ? { invitation } : undefined,
      })

      if (result.error) {
        throw new Error('Could not start Google sign-in. Please try again.')
      }
    },
  })

  return (
    <main className="login-page">
      <Link to="/" className="brand">
        Calendar Club <span>✳</span>
      </Link>
      <section className="login-card">
        <p className="eyebrow">YOUR CALENDARS, TOGETHER</p>
        <h1>
          A little less
          <br />
          calendar juggling.
        </h1>
        <p>Bring your subscriptions into one place. Share just the calendars you choose.</p>
        {!status.configured ? (
          <p className="notice">Google sign-in is being set up. Please check back soon.</p>
        ) : (
          <>
            {invitation && (
              <p className="notice">
                {status.invitationAvailable
                  ? 'You have been invited to join Calendar Club.'
                  : 'This invite is unavailable. Existing members can still sign in.'}
              </p>
            )}
            <button
              type="button"
              className="primary"
              disabled={signInMutation.isPending}
              onClick={() => signInMutation.mutate()}
            >
              Continue with Google
            </button>
          </>
        )}
        {(error || signInMutation.error) && (
          <p role="alert" className="error">
            Could not sign in. Try again or ask for a new invitation.
          </p>
        )}
        <small>A small, invite-only calendar corner.</small>
      </section>
    </main>
  )
}
