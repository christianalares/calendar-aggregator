import { eventFiltersSchema } from '@calendar-aggregator/db/event-filters'
import {
  titleFormattingFromPrefix,
  titleFormattingSchema,
} from '@calendar-aggregator/db/title-formatting'
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { ErrorMessage } from '@/components/error-message'
import { EventFiltersEditor } from '@/components/event-filters-editor'
import { SourceMarker } from '@/components/source-badge'
import { TitleFormattingEditor, withTextIds } from '@/components/title-formatting-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Output, Source } from '@/lib/calendar-types'
import { mutationOptions } from '@/mutations'
import { popModal } from '.'

export function CalendarModal({
  ownerId,
  output,
  sources,
  titleFormattingOnly = false,
  eventFiltersOnly = false,
}: {
  ownerId: string
  output?: Output
  sources: Source[]
  titleFormattingOnly?: boolean
  eventFiltersOnly?: boolean
}) {
  const id = useId()
  const [name, setName] = useState(output?.name ?? '')
  const [selected, setSelected] = useState(
    output?.sources.map((source) => ({
      sourceId: source.sourceId,
      eventFilters: source.eventFilters,
      titleFormatting: withTextIds(
        source.titleFormatting ?? titleFormattingFromPrefix(source.prefix),
      ),
    })) ?? [],
  )
  const save = useMutation(mutationOptions.outputs.save(ownerId))
  const [focusedSource, setFocusedSource] = useState(selected[0]?.sourceId)
  const settingsOnly = titleFormattingOnly || eventFiltersOnly
  const valid = selected.every(
    (item) =>
      titleFormattingSchema.safeParse(item.titleFormatting).success &&
      eventFiltersSchema.safeParse(item.eventFilters).success,
  )

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto font-sans sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {eventFiltersOnly
            ? `Event filters · ${output?.name}`
            : titleFormattingOnly
              ? `Title formatting · ${output?.name}`
              : output
                ? 'Edit calendar'
                : 'Create a calendar'}
        </DialogTitle>
        <DialogDescription>
          {eventFiltersOnly
            ? 'Filter out matching events and preview the exclusions before saving.'
            : titleFormattingOnly
              ? 'Rename events with captures, then add a prefix or suffix to the result.'
              : 'Combine sources into one read-only subscription.'}
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!valid) return
          try {
            await save.mutateAsync({ data: { id: output?.id, name, sources: selected } })
            popModal('calendar')
          } catch {
            // Keep entered values so the owner can retry.
          }
        }}
      >
        {settingsOnly && (
          <div className="flex flex-wrap gap-1">
            {sources
              .filter((source) => selected.some((item) => item.sourceId === source.id))
              .map((source) => (
                <Button
                  key={source.id}
                  type="button"
                  size="sm"
                  variant={focusedSource === source.id ? 'secondary' : 'ghost'}
                  aria-pressed={focusedSource === source.id}
                  onClick={() => setFocusedSource(source.id)}
                >
                  <SourceMarker sourceId={source.id} />
                  {source.name}
                </Button>
              ))}
          </div>
        )}
        {!settingsOnly && (
          <div className="space-y-2">
            <Label htmlFor={`${id}-name`}>Calendar name</Label>
            <Input
              id={`${id}-name`}
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Our week"
            />
          </div>
        )}
        <fieldset className="m-0 space-y-3 p-0">
          {!settingsOnly && (
            <>
              <legend className="text-sm font-medium">Sources to include</legend>
              <p className="m-0 text-sm text-muted-foreground">
                Choose sources, customize titles, and filter out unwanted events.
              </p>
            </>
          )}
          {!sources.length && (
            <p className="m-0 text-sm text-muted-foreground">
              Add a source first, or save an empty calendar for later.
            </p>
          )}
          {sources.map((source) => {
            const membership = selected.find((item) => item.sourceId === source.id)
            if (settingsOnly && !membership) return null
            return (
              <div
                key={source.id}
                hidden={settingsOnly && focusedSource !== source.id}
                className={settingsOnly ? 'min-w-0' : 'min-w-0 space-y-3 rounded-xl border p-3'}
              >
                {!settingsOnly && (
                  <div className="flex min-w-0 items-center gap-2">
                    <Checkbox
                      id={`${id}-${source.id}`}
                      checked={Boolean(membership)}
                      onCheckedChange={(checked) => {
                        setSelected((previous) =>
                          checked
                            ? [
                                ...previous,
                                {
                                  sourceId: source.id,
                                  eventFilters: [],
                                  titleFormatting: titleFormattingFromPrefix(),
                                },
                              ]
                            : previous.filter((item) => item.sourceId !== source.id),
                        )
                      }}
                    />
                    <Label className="min-w-0 break-words" htmlFor={`${id}-${source.id}`}>
                      {source.name}
                    </Label>
                    {!source.enabled && <Badge variant="secondary">Disabled</Badge>}
                  </div>
                )}
                {membership && !eventFiltersOnly && (
                  <TitleFormattingEditor
                    sourceName={source.name}
                    sampleTitles={source.sampleTitles}
                    value={membership.titleFormatting}
                    onChange={(titleFormatting) => {
                      setSelected((previous) =>
                        previous.map((item) =>
                          item.sourceId === source.id ? { ...item, titleFormatting } : item,
                        ),
                      )
                    }}
                  />
                )}
                {membership &&
                  !titleFormattingOnly &&
                  (!settingsOnly || focusedSource === source.id) && (
                    <EventFiltersEditor
                      ownerId={ownerId}
                      source={source}
                      value={membership.eventFilters}
                      expanded={eventFiltersOnly}
                      onChange={(eventFilters) => {
                        setSelected((previous) =>
                          previous.map((item) =>
                            item.sourceId === source.id ? { ...item, eventFilters } : item,
                          ),
                        )
                      }}
                    />
                  )}
              </div>
            )
          })}
        </fieldset>
        <ErrorMessage error={save.error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => popModal('calendar')}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || !valid}>
            {save.isPending
              ? 'Saving...'
              : eventFiltersOnly
                ? 'Save filters'
                : titleFormattingOnly
                  ? 'Save formatting'
                  : 'Save calendar'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
