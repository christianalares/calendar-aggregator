import { titleFormattingFromPrefix } from '@calendar-aggregator/db/title-formatting'
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { ErrorMessage } from '@/components/error-message'
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
}: {
  ownerId: string
  output?: Output
  sources: Source[]
}) {
  const id = useId()
  const [name, setName] = useState(output?.name ?? '')
  const [selected, setSelected] = useState(
    output?.sources.map((source) => ({
      sourceId: source.sourceId,
      eventFilters: source.eventFilters,
      titleFormatting: source.titleFormatting ?? titleFormattingFromPrefix(source.prefix),
    })) ?? [],
  )
  // Keep settings when a source is deselected and selected again in this draft.
  const [settings] = useState(new Map(selected.map((source) => [source.sourceId, source])))
  const save = useMutation(mutationOptions.outputs.save(ownerId))
  return (
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden font-sans sm:max-w-lg">
      <DialogHeader className="shrink-0">
        <DialogTitle>{output ? 'Edit calendar' : 'Create a calendar'}</DialogTitle>
        <DialogDescription>
          Choose a name and sources. Use Customize events to set filters and title rules after
          saving.
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex min-h-0 flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault()
          try {
            await save.mutateAsync({ data: { id: output?.id, name, sources: selected } })
            popModal('calendar')
          } catch {
            /* Preserve the draft for retry. */
          }
        }}
      >
        <div className="min-h-0 overflow-y-auto">
          <fieldset disabled={save.isPending} className="space-y-4">
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
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium">Sources to include</legend>
              {!sources.length && (
                <p className="text-sm text-muted-foreground">
                  Add a source first, or save an empty calendar for later.
                </p>
              )}
              {sources.map((source) => (
                <Label
                  key={source.id}
                  className="flex items-center gap-3 rounded-xl border p-3"
                  htmlFor={`${id}-${source.id}`}
                >
                  <Checkbox
                    id={`${id}-${source.id}`}
                    checked={selected.some((item) => item.sourceId === source.id)}
                    onCheckedChange={(checked) =>
                      setSelected((previous) =>
                        checked
                          ? [
                              ...previous,
                              settings.get(source.id) ?? {
                                sourceId: source.id,
                                eventFilters: [],
                                titleFormatting: titleFormattingFromPrefix(),
                              },
                            ]
                          : previous.filter((item) => item.sourceId !== source.id),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 break-words">{source.name}</span>
                  {!source.enabled && <Badge variant="secondary">Disabled</Badge>}
                </Label>
              ))}
            </fieldset>
          </fieldset>
        </div>
        <ErrorMessage error={save.error} />
        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => popModal('calendar')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || !name.trim()}>
            {save.isPending ? 'Saving...' : 'Save calendar'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
