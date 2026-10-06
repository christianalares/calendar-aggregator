import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, isValid, parseISO } from 'date-fns'
import { useEffect, useState } from 'react'
import { ErrorMessage } from '@/components/error-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Output } from '@/lib/calendar-types'
import { queryOptions } from '@/queries'
import type { MutationOutput } from '@/server-fns'

export function CalendarPreviewModal({ ownerId, output }: { ownerId: string; output: Output }) {
  const preview = useQuery(queryOptions.outputs.preview(ownerId, output.id))
  const client = useQueryClient()
  useEffect(() => {
    if (preview.dataUpdatedAt) {
      void client.invalidateQueries(queryOptions.calendars.list(ownerId))
    }
  }, [preview.dataUpdatedAt, client, ownerId])

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto font-sans sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{output.name}: event preview</DialogTitle>
        <DialogDescription>
          Up to 40 feed entries, shown by their start date. Your calendar app expands recurring
          series; those extra occurrences are not shown here.
        </DialogDescription>
      </DialogHeader>
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={preview.isFetching}
        onClick={() => preview.refetch()}
      >
        Refresh
      </Button>
      {preview.isPending && <p className="m-0 text-muted-foreground">Checking sources...</p>}
      {preview.error && (
        <>
          <ErrorMessage error={preview.error} />
          <Button type="button" variant="outline" onClick={() => preview.refetch()}>
            Try again
          </Button>
        </>
      )}
      {preview.data && (
        <>
          {preview.data.health
            .filter((source) => source.status !== 'healthy')
            .map((source) => (
              <p className="m-0 text-sm text-muted-foreground" key={source.id}>
                {source.name}:{' '}
                {source.status === 'stale'
                  ? 'Showing last successful data.'
                  : 'No usable data yet.'}{' '}
                {source.error}
              </p>
            ))}
          {!preview.data.events.length && (
            <p className="m-0 text-muted-foreground">No events in this calendar yet.</p>
          )}
          {!!preview.data.events.length && <CalendarSample events={preview.data.events} />}
        </>
      )}
    </DialogContent>
  )
}

type PreviewEvent = MutationOutput['outputs']['preview']['events'][number]

function eventDate(event: PreviewEvent) {
  const date = event.start ? parseISO(event.start) : null
  return date && isValid(date) ? date : null
}

function CalendarSample({ events }: { events: PreviewEvent[] }) {
  const dates = events.flatMap((event) => {
    const date = eventDate(event)
    return date ? [date] : []
  })
  const [selected, setSelected] = useState<Date>(dates[0] ?? new Date())
  const [showAll, setShowAll] = useState(false)
  const visibleEvents = showAll
    ? events
    : events.filter((event) => {
        const date = eventDate(event)
        return date && format(date, 'yyyy-MM-dd') === format(selected, 'yyyy-MM-dd')
      })
  return (
    <div className="grid min-w-0 gap-5 sm:grid-cols-[auto_1fr]">
      <div>
        <Calendar
          mode="single"
          required
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            setSelected(date)
            setShowAll(false)
          }}
          modifiers={{ sample: dates }}
          modifiersClassNames={{ sample: 'preview-event-day' }}
          className="mx-auto rounded-xl border bg-card [--cell-size:--spacing(9)]"
        />
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Dots mark dates in this feed sample.
        </p>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <h3 className="font-heading font-bold">
            {showAll ? 'All sample entries' : format(selected, 'EEE, d MMM yyyy')}
          </h3>
          <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Selected day' : 'All entries'}
          </Button>
        </div>
        {!visibleEvents.length && (
          <p className="py-4 text-sm text-muted-foreground">
            No sample entries for this day. Recurring occurrences may still appear in your calendar
            app.
          </p>
        )}
        <div className="divide-y">
          {visibleEvents.map((event, index) => (
            <div className="space-y-2 py-3" key={`${event.uid}-${index}`}>
              <div className="text-sm text-muted-foreground">
                {event.start
                  ? event.allDay
                    ? event.start
                    : new Date(event.start).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                  : 'No start date'}
                {event.allDay && <small className="block">All day</small>}
              </div>
              <div className="min-w-0 space-y-1 break-words">
                <strong>{event.title}</strong>
                {event.location && (
                  <p className="m-0 text-sm text-muted-foreground">{event.location}</p>
                )}
                <div className="flex flex-wrap gap-1">
                  {event.recurring && (
                    <Badge
                      variant="secondary"
                      className="bg-category-blue text-category-blue-foreground"
                    >
                      Recurring
                    </Badge>
                  )}
                  {event.exception && (
                    <Badge variant="secondary" className="bg-warning text-warning-foreground">
                      Changed instance
                    </Badge>
                  )}
                  {event.cancelled && (
                    <Badge variant="secondary" className="bg-danger text-danger-foreground">
                      Cancelled
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
