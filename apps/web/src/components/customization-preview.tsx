import { type EventFilterRule, eventFiltersSchema } from '@calendar-aggregator/db/event-filters'
import {
  type TitleFormatting,
  titleFormattingSchema,
} from '@calendar-aggregator/db/title-formatting'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, Eye, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ErrorMessage } from '@/components/error-message'
import { filterOperators } from '@/components/event-filters-editor'
import { SegmentedTabs } from '@/components/segmented-tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Source } from '@/lib/calendar-types'
import { queryOptions } from '@/queries'

export function CustomizationPreview({
  ownerId,
  source,
  rules,
  titleFormatting,
}: {
  ownerId: string
  source: Source
  rules: EventFilterRule[]
  titleFormatting: TitleFormatting
}) {
  const [view, setView] = useState<'all' | 'changed' | 'excluded'>('all')
  const [draft, setDraft] = useState({ rules, titleFormatting })
  useEffect(() => {
    const timer = setTimeout(() => setDraft({ rules, titleFormatting }), 300)
    return () => clearTimeout(timer)
  }, [rules, titleFormatting])
  const valid =
    eventFiltersSchema.safeParse(rules).success &&
    titleFormattingSchema.safeParse(titleFormatting).success
  const updating = draft.rules !== rules || draft.titleFormatting !== titleFormatting
  const preview = useQuery({
    ...queryOptions.sources.customizationPreview(ownerId, { sourceId: source.id, ...draft, view }),
    enabled: valid && !updating,
  })
  const data = preview.data
  return (
    <aside
      aria-label={`Event preview for ${source.name}`}
      className="min-w-0 space-y-4 rounded-2xl border bg-secondary/30 p-4 lg:sticky lg:top-5 lg:max-h-[calc(100dvh-15rem)] lg:overflow-y-auto"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Eye className="size-4" />
          Live preview
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh preview"
          disabled={!valid || updating || preview.isFetching}
          onClick={() => preview.refetch()}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {source.name} · Preview of your unsaved changes
      </p>
      <SegmentedTabs
        label="Preview entries"
        value={view}
        onChange={setView}
        compact
        options={[
          { value: 'all', label: 'All' },
          { value: 'changed', label: 'Changed' },
          { value: 'excluded', label: 'Excluded' },
        ]}
      >
        <div aria-live="polite" aria-busy={updating || preview.isFetching} className="space-y-3">
          {!valid ? (
            <p className="text-sm text-muted-foreground">Complete the rules to see a preview.</p>
          ) : updating || preview.isFetching || preview.isPending ? (
            <p className="text-sm text-muted-foreground">Updating preview...</p>
          ) : preview.error ? (
            <ErrorMessage error={preview.error} />
          ) : (
            data &&
            (!data.available ? (
              <p className="text-sm text-muted-foreground">
                No usable source data yet. Check the source from the dashboard, then refresh this
                preview.
              </p>
            ) : (
              <>
                <p className="text-sm font-semibold">
                  {data.excludedCount} of {data.total} entries will be filtered out ·{' '}
                  {data.keptCount} kept
                </p>
                <p className="text-xs text-muted-foreground">{data.changedCount} titles changed</p>
                {!data.enabled && (
                  <p className="rounded-lg bg-secondary p-3 text-xs">
                    This source is disabled. Changes apply when it is enabled.
                  </p>
                )}
                {!data.events.length && (
                  <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                    {view === 'excluded'
                      ? 'No events match these filters.'
                      : view === 'changed'
                        ? 'No titles change with these rules.'
                        : 'No events in this source.'}
                  </p>
                )}
                <ul className="space-y-2">
                  {data.events.map((event, index) => (
                    <li
                      key={`${event.uid}-${index}`}
                      className="min-w-0 space-y-2 rounded-xl border bg-card p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {event.exclusion && <Badge variant="secondary">Excluded</Badge>}
                        {event.recurring && <Badge variant="secondary">Recurring series</Badge>}
                        {event.exception && <Badge variant="secondary">Exception</Badge>}
                      </div>
                      {event.title !== event.originalTitle && (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p className="break-words">{event.originalTitle || 'Untitled event'}</p>
                          <ArrowDown className="size-3" />
                        </div>
                      )}
                      <p
                        className={`break-words font-semibold ${event.exclusion ? 'text-muted-foreground line-through' : ''}`}
                      >
                        {event.title || 'Untitled event'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {event.start
                          ? new Date(event.start).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              ...(event.allDay
                                ? { timeZone: 'UTC' }
                                : { hour: '2-digit', minute: '2-digit' }),
                            })
                          : 'No start date'}
                        {event.allDay && ' · All day'}
                        {event.location && ` · ${event.location}`}
                      </p>
                      {event.exclusion ? (
                        <p className="break-words text-xs text-muted-foreground">
                          {event.exclusion.seriesMatch
                            ? `Series excluded by a match in “${event.exclusion.matchedTitle}”`
                            : `Matched: ${event.exclusion.rule.field} ${filterOperators[event.exclusion.rule.operator]} “${event.exclusion.rule.value}”`}
                        </p>
                      ) : (
                        event.renamedBy && (
                          <p className="break-words text-xs text-primary">{event.renamedBy}</p>
                        )
                      )}
                    </li>
                  ))}
                </ul>
                {data.visibleCount > data.events.length && (
                  <p className="text-xs text-muted-foreground">
                    Showing the first {data.events.length} of {data.visibleCount} entries by start
                    date. Counts include every entry.
                  </p>
                )}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Based on the last successful source check
                  {data.lastSuccessAt ? ` (${new Date(data.lastSuccessAt).toLocaleString()})` : ''}.
                  {data.error && ' Using older data after a failed check.'} A match in a recurring
                  series excludes the entire series and its exceptions. Counts refer to feed
                  entries; occurrences are not expanded.
                </p>
              </>
            ))
          )}
        </div>
      </SegmentedTabs>
    </aside>
  )
}
