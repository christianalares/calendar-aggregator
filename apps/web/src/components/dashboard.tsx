import { useMutation, useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  Check,
  Copy,
  Ellipsis,
  Eye,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Type,
} from 'lucide-react'
import { useState } from 'react'
import { pushAlert } from '@/components/alerts'
import { ErrorMessage } from '@/components/error-message'
import { pushModal } from '@/components/modals'
import { SectionHeader } from '@/components/section-header'
import { SourceBadge, SourceMarker } from '@/components/source-badge'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Output, Source } from '@/lib/calendar-types'
import { mutationOptions } from '../mutations'
import { queryOptions } from '../queries'

function time(value: Date | null) {
  return value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not checked yet'
}

function CopyLink({ url }: { url: string }) {
  const [message, setMessage] = useState('')
  return (
    <div className="flex min-w-0 gap-2">
      <Input
        aria-label="Subscription URL"
        readOnly
        value={url}
        className="min-w-0 flex-1 text-xs text-muted-foreground"
        onFocus={(event) => event.target.select()}
      />
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setMessage('Copied')
          } catch {
            setMessage('Select the URL to copy it')
          }
        }}
      >
        {message === 'Copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {message === 'Copied' ? 'Copied' : 'Copy link'}
      </Button>
      {message && <output className="sr-only">{message}</output>}
    </div>
  )
}

function OutputCard({
  ownerId,
  baseURL,
  output,
  sources,
}: {
  ownerId: string
  baseURL: string
  output: Output
  sources: Source[]
}) {
  return (
    <article className="min-w-0">
      <Card className="h-full gap-4">
        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                <CalendarDays aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="break-words font-heading text-lg font-bold leading-tight">
                  {output.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {output.sources.length} {output.sources.length === 1 ? 'source' : 'sources'} ·
                  Subscription
                </p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for calendar ${output.name}`}
                  />
                }
              >
                <Ellipsis aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem
                  onClick={() => pushModal('calendar', { ownerId, sources, output })}
                >
                  <Pencil aria-hidden="true" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!output.sources.length}
                  onClick={() =>
                    pushModal('calendar', { ownerId, sources, output, eventFiltersOnly: true })
                  }
                >
                  <Filter aria-hidden="true" />
                  Event filters
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => pushAlert('replaceCalendarLink', { ownerId, id: output.id })}
                >
                  <RefreshCw aria-hidden="true" />
                  Replace link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    pushAlert('deleteCalendar', { ownerId, id: output.id, name: output.name })
                  }
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {output.sources.map((membership) => (
              <SourceBadge sourceId={membership.sourceId} key={membership.sourceId}>
                {membership.titleFormatting?.before ??
                  (membership.prefix && `${membership.prefix} `)}
                {sources.find((source) => source.id === membership.sourceId)?.name}
              </SourceBadge>
            ))}
            {!output.sources.length && (
              <span className="text-xs text-muted-foreground">No sources selected</span>
            )}
          </div>
          <div className="mt-auto">
            <CopyLink url={`${baseURL}/feed/${output.token}.ics`} />
          </div>
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => pushModal('calendarPreview', { ownerId, output })}
          >
            <Eye aria-hidden="true" />
            Preview events
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!output.sources.length}
            onClick={() =>
              pushModal('calendar', { ownerId, sources, output, titleFormattingOnly: true })
            }
          >
            <Type aria-hidden="true" />
            Title formatting
          </Button>
        </CardFooter>
      </Card>
    </article>
  )
}

function SourceStatus({ source }: { source: Source }) {
  if (!source.enabled) return <StatusBadge>Disabled</StatusBadge>
  if (source.lastError)
    return (
      <StatusBadge tone={source.lastSuccessAt ? 'warning' : 'danger'}>
        {source.lastSuccessAt ? 'Using older data' : 'Unavailable'}
      </StatusBadge>
    )
  if (source.lastSuccessAt) return <StatusBadge tone="success">Healthy</StatusBadge>
  return <StatusBadge>Not checked</StatusBadge>
}

export function CalendarDashboard({ ownerId, baseURL }: { ownerId: string; baseURL: string }) {
  const calendarsQuery = useQuery(queryOptions.calendars.list(ownerId))
  const checkSourceMutation = useMutation(mutationOptions.sources.check(ownerId))
  if (calendarsQuery.isPending)
    return <p className="py-8 text-sm text-muted-foreground">Loading your calendars...</p>
  if (!calendarsQuery.data)
    return (
      <section className="space-y-3">
        <ErrorMessage error={calendarsQuery.error} />
        <Button variant="outline" onClick={() => calendarsQuery.refetch()}>
          Try again
        </Button>
      </section>
    )
  const { sources, outputs } = calendarsQuery.data
  return (
    <>
      <section aria-label="Your calendars" className="min-w-0">
        <SectionHeader
          title="Your calendars"
          count={outputs.length}
          description="Bring your sources together. Share one simple link."
          action={
            <Button onClick={() => pushModal('calendar', { ownerId, sources })}>
              <Plus aria-hidden="true" />
              Create calendar
            </Button>
          }
        />
        {!outputs.length && (
          <Card className="items-center gap-3 py-8 text-center">
            <CalendarDays aria-hidden="true" className="size-8 text-primary" />
            <h3 className="font-heading text-lg font-bold">A clearer view of your week</h3>
            <p className="max-w-sm px-4 text-sm text-muted-foreground">
              Add your sources below, then combine them into a calendar you can share.
            </p>
            <Button variant="outline" onClick={() => pushModal('calendar', { ownerId, sources })}>
              Create your first calendar
            </Button>
          </Card>
        )}
        <div className="calendar-grid" data-testid="calendar-grid">
          {outputs.map((output) => (
            <OutputCard
              key={output.id}
              ownerId={ownerId}
              baseURL={baseURL}
              output={output}
              sources={sources}
            />
          ))}
        </div>
        {!!outputs.length && (
          <p className="mt-3 text-xs text-muted-foreground">
            Anyone with a calendar link can subscribe in their calendar app using “Subscribe from
            URL”.
          </p>
        )}
      </section>
      <section aria-label="Sources" className="min-w-0">
        <SectionHeader
          title="Sources"
          count={sources.length}
          description="Your original calendar subscriptions, kept in one place."
          action={
            <Button onClick={() => pushModal('source', { ownerId })}>
              <Plus aria-hidden="true" />
              Add source
            </Button>
          }
        />
        <Card className="gap-0 overflow-hidden py-0">
          <Table aria-label="Sources">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last attempt</TableHead>
                <TableHead>Last success</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!sources.length && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="whitespace-normal px-4 py-8 text-center text-muted-foreground"
                  >
                    No sources yet. Add an iCalendar subscription URL to get started.
                  </TableCell>
                </TableRow>
              )}
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="min-w-36 max-w-56 whitespace-normal py-3 pl-4 font-semibold break-words">
                    <span className="flex items-center gap-2">
                      <SourceMarker sourceId={source.id} />
                      {source.name}
                      {source.useBrowser && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                          Browser fallback
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      title={source.url}
                      className="block max-w-52 truncate text-xs text-muted-foreground hover:text-primary"
                    >
                      {source.url}
                    </a>
                    {source.lastError && (
                      <p className="mt-1 max-w-52 whitespace-normal break-words text-xs text-destructive">
                        {source.lastError}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <SourceStatus source={source} />
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    {time(source.lastAttemptAt)}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">
                    {time(source.lastSuccessAt)}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for source ${source.name}`}
                          />
                        }
                      >
                        <Ellipsis aria-hidden="true" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-40">
                        <DropdownMenuItem
                          disabled={!source.enabled || checkSourceMutation.isPending}
                          onClick={() => checkSourceMutation.mutate({ data: { id: source.id } })}
                        >
                          <RefreshCw aria-hidden="true" />
                          Check
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => pushModal('source', { ownerId, source })}>
                          <Pencil aria-hidden="true" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            pushAlert('deleteSource', { ownerId, id: source.id, name: source.name })
                          }
                        >
                          <Trash2 aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {checkSourceMutation.isPending &&
                      checkSourceMutation.variables?.data.id === source.id && (
                        <output className="sr-only">Checking {source.name}...</output>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Status shows the last check. Sources refresh on demand, at most every 15 minutes.
            Calendar apps choose their own refresh times.
          </p>
        </Card>
        <ErrorMessage error={checkSourceMutation.error} />
      </section>
    </>
  )
}
