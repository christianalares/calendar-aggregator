import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Brand } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <Brand />
        <ThemeToggle />
      </div>
      <Card className="py-6 sm:py-8">
        <CardContent className="space-y-6 sm:px-8">
          <p className="text-xs font-bold tracking-widest text-primary">YOUR CALENDARS, TOGETHER</p>
          <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight">
            A little less
            <br />
            calendar juggling.
          </h1>
          <p className="text-muted-foreground">
            Bring your subscriptions into one place. Share just the calendars you choose.
          </p>
          {!status.configured ? (
            <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
              Google sign-in is being set up. Please check back soon.
            </p>
          ) : (
            <>
              {invitation && (
                <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
                  {status.invitationAvailable
                    ? 'You have been invited to join CalPal.'
                    : 'This invite is unavailable. Existing members can still sign in.'}
                </p>
              )}
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={signInMutation.isPending}
                onClick={() => signInMutation.mutate()}
              >
                Continue with Google
              </Button>
            </>
          )}
          {(error || signInMutation.error) && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              Could not sign in. Try again or ask for a new invitation.
            </p>
          )}
          <small className="block text-muted-foreground">
            A small, invite-only calendar corner.
          </small>
        </CardContent>
      </Card>
    </main>
  )
}
