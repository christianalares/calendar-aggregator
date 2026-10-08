import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { ErrorMessage } from '@/components/error-message'
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
import type { Source } from '@/lib/calendar-types'
import { mutationOptions } from '@/mutations'
import { popModal } from '.'

export function SourceModal({ ownerId, source }: { ownerId: string; source?: Source }) {
  const id = useId()
  const [name, setName] = useState(source?.name ?? '')
  const [url, setURL] = useState(source?.url ?? '')
  const [enabled, setEnabled] = useState(source?.enabled ?? true)
  const [useBrowser, setUseBrowser] = useState(source?.useBrowser ?? false)
  const save = useMutation(mutationOptions.sources.save(ownerId))

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto font-sans sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{source ? 'Edit source' : 'Add a source'}</DialogTitle>
        <DialogDescription>
          Add an iCalendar subscription link. This address stays private in your account.
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          try {
            await save.mutateAsync({ data: { id: source?.id, name, url, enabled, useBrowser } })
            popModal('source')
          } catch {
            // Keep entered values so the owner can retry.
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Family, football, work..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-url`}>Calendar subscription URL</Label>
          <Input
            id={`${id}-url`}
            required
            type="url"
            maxLength={4096}
            value={url}
            onChange={(event) => setURL(event.target.value)}
            placeholder="https://example.com/calendar.ics"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id={`${id}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor={`${id}-enabled`}>Include this source in calendars</Label>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Checkbox id={`${id}-browser`} checked={useBrowser} onCheckedChange={setUseBrowser} />
            <Label htmlFor={`${id}-browser`}>Use browser fallback</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Try a browser connection if the calendar provider blocks the normal connection. Checks
            may take up to a minute. Updates use the same 15-minute cache.
          </p>
        </div>
        <ErrorMessage error={save.error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => popModal('source')}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving...' : 'Save source'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
