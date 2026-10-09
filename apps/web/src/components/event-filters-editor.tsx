import { type EventFilterRule, eventFiltersSchema } from '@calendar-aggregator/db/event-filters'
import { useQuery } from '@tanstack/react-query'
import { format, isValid, parseISO } from 'date-fns'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { ErrorMessage } from '@/components/error-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Source } from '@/lib/calendar-types'
import { queryOptions } from '@/queries'

const operators = {
  contains: 'contains',
  equals: 'equals',
  startsWith: 'starts with',
  endsWith: 'ends with',
}
const selectClass =
  'h-8 min-w-0 w-full rounded-md border bg-background px-2 text-xs outline-offset-2'

function eventTime(start: string | null, allDay: boolean) {
  const date = start ? parseISO(start) : null
  return date && isValid(date)
    ? format(date, allDay ? 'MMM d, yyyy' : 'MMM d, yyyy · HH:mm')
    : 'No start date'
}

export function EventFiltersEditor({
  ownerId,
  source,
  value,
  onChange,
  expanded = false,
}: {
  ownerId: string
  source: Source
  value: EventFilterRule[]
  onChange: (value: EventFilterRule[]) => void
  expanded?: boolean
}) {
  const id = useId()
  const [open, setOpen] = useState(expanded || value.length > 0)
  const [rules, setRules] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setRules(value), 300)
    return () => clearTimeout(timer)
  }, [value])
  const validation = eventFiltersSchema.safeParse(value)
  const updating = rules !== value
  const preview = useQuery({
    ...queryOptions.sources.filterPreview(ownerId, { sourceId: source.id, rules }),
    enabled: open && !updating && validation.success,
  })
  const update = (rule: EventFilterRule) =>
    onChange(value.map((item) => (item.id === rule.id ? rule : item)))

  return (
    <section
      aria-label={`Event filters for ${source.name}`}
      className="min-w-0 space-y-3 rounded-xl bg-secondary/70 p-3"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-filters`}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Filter out events
        <span className="ml-1 rounded bg-card px-1.5 py-0.5 text-[11px]">{value.length}</span>
      </button>
      {open && (
        <div id={`${id}-filters`} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Exclude events matching any enabled rule. Match original text before title formatting.
            Text is literal, including punctuation and spaces.
          </p>
          {value.map((rule, index) => (
            <div key={rule.id} className="min-w-0 space-y-2 rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-2 text-xs" htmlFor={`${id}-${rule.id}`}>
                  <Checkbox
                    id={`${id}-${rule.id}`}
                    checked={rule.enabled}
                    onCheckedChange={(checked) => update({ ...rule, enabled: Boolean(checked) })}
                  />
                  Enable filter {index + 1}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete filter ${index + 1}`}
                  onClick={() => onChange(value.filter((item) => item.id !== rule.id))}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Event field
                  <select
                    aria-label={`Event field for filter ${index + 1}`}
                    className={selectClass}
                    value={rule.field}
                    onChange={(event) =>
                      update({ ...rule, field: event.target.value as EventFilterRule['field'] })
                    }
                  >
                    <option value="title">Title</option>
                    <option value="description">Description</option>
                    <option value="location">Location</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Match
                  <select
                    aria-label={`Match for filter ${index + 1}`}
                    className={selectClass}
                    value={rule.operator}
                    onChange={(event) =>
                      update({
                        ...rule,
                        operator: event.target.value as EventFilterRule['operator'],
                      })
                    }
                  >
                    {Object.entries(operators).map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Input
                aria-label={`Text to match for filter ${index + 1}`}
                placeholder="Text to filter out"
                className="h-8 text-xs"
                maxLength={500}
                value={rule.value}
                onChange={(event) => update({ ...rule, value: event.target.value })}
              />
              <Label
                htmlFor={`${id}-${rule.id}-case`}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Checkbox
                  id={`${id}-${rule.id}-case`}
                  checked={rule.caseSensitive}
                  onCheckedChange={(checked) =>
                    update({ ...rule, caseSensitive: Boolean(checked) })
                  }
                />
                Match case for filter {index + 1}
              </Label>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-0 text-primary"
            disabled={value.length >= 20}
            onClick={() =>
              onChange([
                ...value,
                {
                  id: crypto.randomUUID(),
                  enabled: true,
                  field: 'title',
                  operator: 'contains',
                  value: '',
                  caseSensitive: false,
                },
              ])
            }
          >
            <Plus className="size-3" />
            Add filter
          </Button>
          {!validation.success && (
            <p role="alert" className="text-xs text-destructive">
              {validation.error.issues[0]?.message}
            </p>
          )}
          <div
            className="min-w-0 space-y-2 border-t pt-3"
            aria-live="polite"
            aria-busy={updating || preview.isFetching}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Exclusion preview</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={updating || !validation.success || preview.isFetching}
                onClick={() => preview.refetch()}
              >
                Refresh preview
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A match in a recurring series excludes the entire series and its exceptions. Counts
              refer to feed entries; recurring occurrences are not expanded.
            </p>
            {!validation.success ? (
              <p className="text-xs text-muted-foreground">
                Complete the filters to see a preview.
              </p>
            ) : updating || preview.isFetching || preview.isPending ? (
              <p className="text-xs text-muted-foreground">Updating preview...</p>
            ) : preview.error ? (
              <ErrorMessage error={preview.error} />
            ) : (
              preview.data &&
              (!preview.data.available ? (
                <p className="text-xs text-muted-foreground">
                  No usable source data yet. Check the source from the dashboard, then refresh this
                  preview.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    {preview.data.excludedCount} of {preview.data.total} entries will be filtered
                    out
                    {' · '}
                    {preview.data.keptCount} kept
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Based on the last successful source check
                    {preview.data.lastSuccessAt
                      ? ` (${new Date(preview.data.lastSuccessAt).toLocaleString()})`
                      : ''}
                    .{preview.data.error && ' Using older data after a failed check.'}
                  </p>
                  {!preview.data.enabled && (
                    <p className="text-xs text-muted-foreground">
                      This source is disabled. These rules apply when you enable it.
                    </p>
                  )}
                  {!preview.data.excludedCount && (
                    <p className="text-xs text-muted-foreground">No events match these filters.</p>
                  )}
                  <ul className="max-h-72 space-y-2 overflow-y-auto">
                    {preview.data.events.map((event, index) => (
                      <li
                        key={`${event.uid}-${index}`}
                        className="min-w-0 space-y-1 rounded-lg border bg-card p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="break-words font-medium">{event.title}</span>
                          {event.recurring && <Badge variant="secondary">Recurring series</Badge>}
                          {event.exception && <Badge variant="secondary">Exception</Badge>}
                        </div>
                        <p className="text-muted-foreground">
                          {eventTime(event.start, event.allDay)}
                          {event.allDay && ' · All day'}
                        </p>
                        {event.rule.field !== 'title' && (
                          <p className="break-words text-muted-foreground">
                            {event.rule.field === 'location' ? event.location : event.description}
                          </p>
                        )}
                        <p className="break-words text-muted-foreground">
                          {event.seriesMatch
                            ? `Series excluded by a match in “${event.matchedTitle || 'Untitled event'}”`
                            : `Matched: ${event.rule.field} ${operators[event.rule.operator]} “${event.rule.value}”`}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {preview.data.excludedCount > preview.data.events.length && (
                    <p className="text-xs text-muted-foreground">
                      Showing the first {preview.data.events.length} excluded entries by start date.
                      All {preview.data.excludedCount} will be excluded.
                    </p>
                  )}
                </>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  )
}
