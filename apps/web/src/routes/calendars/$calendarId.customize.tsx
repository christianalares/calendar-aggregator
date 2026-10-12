import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Brand } from '@/components/brand'
import { CalendarCustomizationWorkspace } from '@/components/calendar-customization-workspace'
import { ErrorMessage } from '@/components/error-message'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { queryOptions } from '@/queries'

export const Route = createFileRoute('/calendars/$calendarId/customize')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.query(queryOptions.auth.currentUser())
    if (!user) {
      context.queryClient.clear()
      throw redirect({ to: '/login' })
    }
    return { user }
  },
  component: CustomizeCalendar,
})

function CustomizeCalendar() {
  const { user } = Route.useRouteContext()
  const { calendarId } = Route.useParams()
  const navigate = useNavigate()
  const calendars = useQuery(queryOptions.calendars.list(user.id))
  const output = calendars.data?.outputs.find((item) => item.id === calendarId)
  return (
    <>
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <Brand />
          <ThemeToggle />
        </div>
      </header>
      {output && calendars.data ? (
        <CalendarCustomizationWorkspace
          key={output.id}
          ownerId={user.id}
          output={output}
          sources={calendars.data.sources}
        />
      ) : (
        <main className="page-shell space-y-4 py-8">
          <h1>
            {calendars.isPending
              ? 'Loading your calendar...'
              : calendars.error
                ? 'Could not load your calendar'
                : 'Calendar not found'}
          </h1>
          <ErrorMessage error={calendars.error} />
          {calendars.error && <Button onClick={() => calendars.refetch()}>Try again</Button>}
          <Button variant="outline" onClick={() => navigate({ to: '/' })}>
            All calendars
          </Button>
        </main>
      )}
    </>
  )
}
