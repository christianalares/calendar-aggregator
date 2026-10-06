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
    output?.sources.map((source) => ({ sourceId: source.sourceId, prefix: source.prefix })) ?? [],
  )
  const save = useMutation(mutationOptions.outputs.save(ownerId))

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto font-sans sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{output ? 'Edit calendar' : 'Create a calendar'}</DialogTitle>
        <DialogDescription>Combine sources into one read-only subscription.</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          try {
            await save.mutateAsync({ data: { id: output?.id, name, sources: selected } })
            popModal('calendar')
          } catch {
            // Keep entered values so the owner can retry.
          }
        }}
      >
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
        <fieldset className="m-0 space-y-3 p-0">
          <legend className="text-sm font-medium">Sources to include</legend>
          <p className="m-0 text-sm text-muted-foreground">
            Choose whole calendars and give each one a title prefix.
          </p>
          {!sources.length && (
            <p className="m-0 text-sm text-muted-foreground">
              Add a source first, or save an empty calendar for later.
            </p>
          )}
          {sources.map((source) => {
            const membership = selected.find((item) => item.sourceId === source.id)
            return (
              <div key={source.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Checkbox
                    id={`${id}-${source.id}`}
                    checked={Boolean(membership)}
                    onCheckedChange={(checked) => {
                      setSelected((previous) =>
                        checked
                          ? [...previous, { sourceId: source.id, prefix: '' }]
                          : previous.filter((item) => item.sourceId !== source.id),
                      )
                    }}
                  />
                  <Label className="min-w-0 break-words" htmlFor={`${id}-${source.id}`}>
                    {source.name}
                  </Label>
                  {!source.enabled && <Badge variant="secondary">Disabled</Badge>}
                </div>
                <Input
                  aria-label={`Prefix for ${source.name}`}
                  placeholder="Prefix, e.g. ⚽"
                  disabled={!membership}
                  maxLength={100}
                  value={membership?.prefix ?? ''}
                  onChange={(event) => {
                    setSelected((previous) =>
                      previous.map((item) =>
                        item.sourceId === source.id
                          ? { ...item, prefix: event.target.value }
                          : item,
                      ),
                    )
                  }}
                />
              </div>
            )
          })}
        </fieldset>
        <ErrorMessage error={save.error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => popModal('calendar')}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving...' : 'Save calendar'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
