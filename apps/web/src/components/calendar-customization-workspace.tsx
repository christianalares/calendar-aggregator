import { eventFiltersSchema } from '@calendar-aggregator/db/event-filters'
import {
  titleFormattingFromPrefix,
  titleFormattingSchema,
} from '@calendar-aggregator/db/title-formatting'
import { useMutation } from '@tanstack/react-query'
import { useBlocker, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Check, Filter, Layers, Type } from 'lucide-react'
import { useEffect, useState } from 'react'
import { pushAlert } from '@/components/alerts'
import { CustomizationPreview } from '@/components/customization-preview'
import { ErrorMessage } from '@/components/error-message'
import { EventFiltersEditor } from '@/components/event-filters-editor'
import { SegmentedTabs } from '@/components/segmented-tabs'
import { SourceMarker } from '@/components/source-badge'
import { TitleFormattingEditor, withTextIds } from '@/components/title-formatting-editor'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { Output, Source } from '@/lib/calendar-types'
import { mutationOptions } from '@/mutations'

function initialDraft(output: Output, sources: Source[]) {
  return sources.map((source) => {
    const member = output.sources.find((item) => item.sourceId === source.id)
    return {
      sourceId: source.id,
      included: Boolean(member),
      eventFilters: member?.eventFilters ?? [],
      titleFormatting: withTextIds(
        member?.titleFormatting ?? titleFormattingFromPrefix(member?.prefix),
      ),
    }
  })
}

export function CalendarCustomizationWorkspace({
  ownerId,
  output,
  sources,
}: {
  ownerId: string
  output: Output
  sources: Source[]
}) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => initialDraft(output, sources))
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft))
  const [focused, setFocused] = useState(output.sources[0]?.sourceId)
  const [tab, setTab] = useState<'filters' | 'titles' | 'sources'>(
    output.sources.length ? 'filters' : 'sources',
  )
  const [saved, setSaved] = useState(false)
  const save = useMutation(mutationOptions.outputs.save(ownerId))
  const dirty = JSON.stringify(draft) !== baseline
  const valid = draft
    .filter((item) => item.included)
    .every(
      (item) =>
        eventFiltersSchema.safeParse(item.eventFilters).success &&
        titleFormattingSchema.safeParse(item.titleFormatting).success,
    )
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  useEffect(() => {
    if (blocker.status === 'blocked')
      pushAlert('discardCalendarChanges', { onDiscard: blocker.proceed, onKeep: blocker.reset })
  }, [blocker.status, blocker.proceed, blocker.reset])
  const source = sources.find((item) => item.id === focused)
  const member = draft.find((item) => item.sourceId === focused && item.included)
  const update = (next: typeof draft) => {
    setDraft(next)
    setSaved(false)
  }
  return (
    <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-5 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2"
            disabled={save.isPending}
            onClick={() => navigate({ to: '/' })}
          >
            <ArrowLeft className="size-4" />
            All calendars
          </Button>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Customize events
          </p>
          <h1 className="break-words font-heading text-2xl font-extrabold sm:text-3xl">
            {output.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose what makes it in, and how it reads.
          </p>
        </div>
      </div>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)_330px] xl:grid-cols-[220px_minmax(0,1fr)_360px]">
        <nav
          aria-label="Calendar sources"
          className="min-w-0 rounded-2xl border bg-card p-3 lg:sticky lg:top-5"
        >
          <p className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sources in this calendar
          </p>
          <div className="flex flex-wrap gap-1 lg:flex-col">
            {sources
              .filter((item) =>
                draft.some((member) => member.sourceId === item.id && member.included),
              )
              .map((item) => (
                <Button
                  key={item.id}
                  variant={focused === item.id && tab !== 'sources' ? 'secondary' : 'ghost'}
                  className="h-auto min-h-10 min-w-0 justify-start whitespace-normal py-2 text-left"
                  aria-pressed={focused === item.id && tab !== 'sources'}
                  disabled={save.isPending}
                  onClick={() => {
                    setFocused(item.id)
                    if (tab === 'sources') setTab('filters')
                  }}
                >
                  <SourceMarker sourceId={item.id} />
                  <span className="min-w-0 break-words">
                    {item.name}
                    {!item.enabled && (
                      <span className="block text-xs text-muted-foreground">Disabled</span>
                    )}
                  </span>
                </Button>
              ))}
          </div>
          {!draft.some((item) => item.included) && (
            <p className="px-2 py-3 text-sm text-muted-foreground">No sources selected.</p>
          )}
          <Button
            variant={tab === 'sources' ? 'secondary' : 'ghost'}
            className="mt-3 w-full justify-start border-t"
            disabled={save.isPending}
            onClick={() => setTab('sources')}
          >
            <Layers className="size-4" />
            Manage sources
          </Button>
        </nav>
        <section className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">
          {tab === 'sources' ? (
            <>
              <h2 className="font-heading text-xl font-bold">Sources to include</h2>
              <p className="mb-5 mt-1 text-sm text-muted-foreground">
                Choose which sources contribute to {output.name}. Rules are kept while you adjust
                this draft.
              </p>
              <fieldset disabled={save.isPending} className="space-y-3">
                {sources.map((item) => (
                  <label
                    key={item.id}
                    htmlFor={`include-${item.id}`}
                    className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-4"
                  >
                    <Checkbox
                      id={`include-${item.id}`}
                      checked={draft.find((member) => member.sourceId === item.id)?.included}
                      onCheckedChange={(checked) => {
                        update(
                          draft.map((member) =>
                            member.sourceId === item.id
                              ? { ...member, included: Boolean(checked) }
                              : member,
                          ),
                        )
                        if (checked && !focused) setFocused(item.id)
                      }}
                    />
                    <SourceMarker sourceId={item.id} />
                    <span className="min-w-0 break-words">
                      {item.name}
                      {!item.enabled && (
                        <span className="ml-2 text-xs text-muted-foreground">Disabled</span>
                      )}
                    </span>
                  </label>
                ))}
                {!sources.length && (
                  <p className="text-sm text-muted-foreground">
                    Add a source from the dashboard to get started.
                  </p>
                )}
              </fieldset>
            </>
          ) : source && member ? (
            <>
              <div className="mb-4 flex items-center gap-2">
                <SourceMarker sourceId={source.id} />
                <h2 className="min-w-0 break-words font-heading text-xl font-bold">
                  {source.name}
                </h2>
              </div>
              <SegmentedTabs
                label="Event customization"
                value={tab}
                disabled={save.isPending}
                onChange={setTab}
                options={[
                  {
                    value: 'filters',
                    label: (
                      <>
                        <Filter className="size-4" />
                        Filters{' '}
                        <span className="text-xs text-muted-foreground">
                          {member.eventFilters.length}
                        </span>
                      </>
                    ),
                  },
                  {
                    value: 'titles',
                    label: (
                      <>
                        <Type className="size-4" />
                        Titles{' '}
                        <span className="text-xs text-muted-foreground">
                          {member.titleFormatting.rules.length}
                        </span>
                      </>
                    ),
                  },
                ]}
              >
                <fieldset disabled={save.isPending} className="min-w-0">
                  {tab === 'filters' ? (
                    <EventFiltersEditor
                      key={source.id}
                      source={source}
                      value={member.eventFilters}
                      onChange={(eventFilters) =>
                        update(
                          draft.map((item) =>
                            item.sourceId === source.id ? { ...item, eventFilters } : item,
                          ),
                        )
                      }
                    />
                  ) : (
                    <TitleFormattingEditor
                      key={source.id}
                      sourceName={source.name}
                      sampleTitles={source.sampleTitles}
                      value={member.titleFormatting}
                      onChange={(titleFormatting) =>
                        update(
                          draft.map((item) =>
                            item.sourceId === source.id ? { ...item, titleFormatting } : item,
                          ),
                        )
                      }
                    />
                  )}
                </fieldset>
              </SegmentedTabs>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select an included source to edit its filters and titles, or choose Manage sources.
            </p>
          )}
        </section>
        {source && member && tab !== 'sources' ? (
          <CustomizationPreview
            key={source.id}
            ownerId={ownerId}
            source={source}
            rules={member.eventFilters}
            titleFormatting={member.titleFormatting}
          />
        ) : (
          <aside className="rounded-2xl border bg-secondary/30 p-5 text-sm text-muted-foreground">
            Filters and titles apply separately to each source in this calendar. Select a source to
            preview its events.
          </aside>
        )}
      </div>
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1392px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              {saved && <Check className="size-4 text-primary" />}
              {save.isPending
                ? 'Saving your changes...'
                : dirty
                  ? 'Unsaved changes'
                  : saved
                    ? 'Changes saved'
                    : 'All changes saved'}
            </p>
            <ErrorMessage error={save.error} />
            {dirty && !valid && (
              <p className="text-xs text-destructive">
                Complete the rules in included sources before saving.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => navigate({ to: '/' })}
            >
              Cancel
            </Button>
            <Button
              disabled={save.isPending || !valid || !dirty}
              onClick={async () => {
                const snapshot = JSON.stringify(draft)
                try {
                  await save.mutateAsync({
                    data: {
                      id: output.id,
                      name: output.name,
                      sources: draft
                        .filter((item) => item.included)
                        .map(({ included: _included, ...item }) => item),
                    },
                  })
                  setBaseline(snapshot)
                  setSaved(true)
                } catch {
                  /* Preserve the complete draft for retry. */
                }
              }}
            >
              Save changes
            </Button>
          </div>
        </div>
      </footer>
    </main>
  )
}
