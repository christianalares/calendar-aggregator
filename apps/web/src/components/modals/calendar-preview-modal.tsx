import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMilliseconds,
} from 'date-fns'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ErrorMessage } from '@/components/error-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import type { Output } from '@/lib/calendar-types'
import { queryOptions } from '@/queries'
import type { MutationOutput } from '@/server-fns'

export function CalendarPreviewModal({ ownerId, output }: { ownerId: string; output: Output }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const preview = useQuery(
    queryOptions.outputs.preview(ownerId, output.id, {
      from: format(startOfWeek(month, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      to: format(addDays(endOfWeek(endOfMonth(month), { weekStartsOn: 1 }), 1), 'yyyy-MM-dd'),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  )
  const client = useQueryClient()
  useEffect(() => {
    if (preview.dataUpdatedAt) {
      void client.invalidateQueries(queryOptions.calendars.list(ownerId))
    }
  }, [preview.dataUpdatedAt, client, ownerId])

  return (
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] min-w-0 overflow-y-auto font-sans sm:max-w-7xl">
      <DialogHeader className="pr-8">
        <DialogTitle>{output.name}: event preview</DialogTitle>
        <DialogDescription>
          Events for this month, including recurring occurrences. Click an event for details.
        </DialogDescription>
      </DialogHeader>
      {preview.isPending && <output className="text-muted-foreground">Loading events...</output>}
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
          {preview.data.limited && (
            <output className="text-sm text-muted-foreground">
              Some recurring events could not be expanded because this feed exceeded the preview
              limit.
            </output>
          )}
        </>
      )}
      <CalendarSample events={preview.data?.events ?? []} month={month} onMonthChange={setMonth} />
    </DialogContent>
  )
}

type PreviewEvent = MutationOutput['outputs']['preview']['events'][number]

function eventDate(event: PreviewEvent) {
  const date = event.start ? parseISO(event.start) : null
  return date && isValid(date) ? date : null
}

function CalendarSample({
  events,
  month,
  onMonthChange,
}: {
  events: PreviewEvent[]
  month: Date
  onMonthChange: (month: Date) => void
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(month, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  })
  const weeks = Array.from({ length: days.length / 7 }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  )
  const eventsByDay = new Map<string, PreviewEvent[]>()
  const undatedEvents: PreviewEvent[] = []
  for (const event of events) {
    const date = eventDate(event)
    if (!date) {
      undatedEvents.push(event)
      continue
    }
    const end = event.end ? parseISO(event.end) : null
    const last = end && isValid(end) && end > date ? subMilliseconds(end, 1) : date
    const firstVisible = date > days[0] ? date : days[0]
    const lastVisible = last < days[days.length - 1] ? last : days[days.length - 1]
    if (format(firstVisible, 'yyyy-MM-dd') > format(lastVisible, 'yyyy-MM-dd')) continue
    for (const day of eachDayOfInterval({ start: firstVisible, end: lastVisible })) {
      const key = format(day, 'yyyy-MM-dd')
      const dayEvents = eventsByDay.get(key) ?? []
      dayEvents.push(event)
      eventsByDay.set(key, dayEvents)
    }
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            onClick={() => onMonthChange(addMonths(month, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <h3
            className="min-w-32 text-center font-heading font-bold sm:min-w-40 sm:text-lg"
            aria-live="polite"
          >
            {format(month, 'MMMM yyyy')}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Next month"
            onClick={() => onMonthChange(addMonths(month, 1))}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onMonthChange(startOfMonth(new Date()))}
        >
          Today
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table
          className="w-full min-w-[700px] table-fixed border-collapse bg-card"
          aria-label={format(month, 'MMMM yyyy')}
        >
          <thead>
            <tr>
              {days.slice(0, 7).map((day) => (
                <th
                  key={day.getDay()}
                  scope="col"
                  className="border-b px-2 py-2 text-right text-xs font-medium text-muted-foreground"
                >
                  {format(day, 'EEE')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={format(week[0], 'yyyy-MM-dd')}>
                {week.map((day) => {
                  const key = format(day, 'yyyy-MM-dd')
                  const currentMonth = isSameMonth(day, month)
                  return (
                    <td
                      key={key}
                      aria-label={format(day, 'EEEE, MMMM d, yyyy')}
                      className={cn(
                        'border-r border-b p-1 align-top last:border-r-0 sm:p-1.5',
                        !currentMonth && 'bg-muted/40',
                        currentMonth && day.getDay() % 6 === 0 && 'bg-muted/20',
                      )}
                    >
                      <div className="min-h-28 sm:min-h-[clamp(4rem,9dvh,8rem)]">
                        <div className="mb-1 flex justify-end">
                          <time
                            dateTime={key}
                            aria-current={isToday(day) ? 'date' : undefined}
                            className={cn(
                              'flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm',
                              !currentMonth && 'text-muted-foreground',
                              isToday(day) && 'bg-red-500 font-bold text-white',
                            )}
                          >
                            {format(day, currentMonth ? 'd' : 'MMM d')}
                          </time>
                        </div>
                        <div className="space-y-1">
                          {eventsByDay.get(key)?.map((event, index) => {
                            const start = eventDate(event)
                            return (
                              <CalendarEntry
                                key={`${event.uid}-${index}`}
                                event={event}
                                continuation={start ? format(start, 'yyyy-MM-dd') !== key : false}
                              />
                            )
                          })}
                        </div>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!!undatedEvents.length && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">No start date</h3>
          {undatedEvents.map((event, index) => (
            <CalendarEntry key={`${event.uid}-${index}`} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}

function CalendarEntry({
  event,
  continuation = false,
}: {
  event: PreviewEvent
  continuation?: boolean
}) {
  const date = eventDate(event)
  const time =
    date && !event.allDay
      ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : null
  return (
    <Popover>
      <PopoverTrigger
        render={<button type="button" />}
        aria-label={`${event.title}${event.allDay ? ', All day' : time ? `, ${time}` : ''}${event.cancelled ? ', Cancelled' : ''}`}
        className={cn(
          'flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
          event.allDay && 'bg-category-blue text-category-blue-foreground',
          event.cancelled && 'text-muted-foreground line-through',
        )}
      >
        <span
          aria-hidden="true"
          className="h-3 w-1 shrink-0 rounded-full bg-category-blue-marker"
        />
        <span className="min-w-0 flex-1 truncate">{event.title}</span>
        {time && !continuation && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{time}</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="max-w-[calc(100vw-2rem)] p-3" align="start">
        <PopoverTitle className="break-words">{event.title}</PopoverTitle>
        <p className="m-0 text-muted-foreground">
          {date ? format(date, 'EEE, d MMM yyyy') : 'No start date'}
          {event.allDay ? ' · All day' : time ? ` · ${time}` : ''}
        </p>
        {event.location && <p className="m-0 break-words">{event.location}</p>}
        <div className="flex flex-wrap gap-1">
          {event.recurring && (
            <Badge variant="secondary" className="bg-category-blue text-category-blue-foreground">
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
      </PopoverContent>
    </Popover>
  )
}
