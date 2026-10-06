import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { mutationOptions } from '../mutations'
import { queryOptions } from '../queries'
import type { MutationOutput } from '../server-fns'

type Calendars = MutationOutput['calendars']['list']
type Source = Calendars['sources'][number]
type Output = Calendars['outputs'][number]

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby={titleId}>
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}

function ErrorMessage({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="error">
      {error.message || 'Could not save. Please try again.'}
    </p>
  ) : null
}

function time(value: Date | null) {
  return value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not checked yet'
}

function SourceForm({
  ownerId,
  source,
  onClose,
}: {
  ownerId: string
  source?: Source
  onClose: () => void
}) {
  const [name, setName] = useState(source?.name ?? '')
  const [url, setURL] = useState(source?.url ?? '')
  const [enabled, setEnabled] = useState(source?.enabled ?? true)
  const saveSourceMutation = useMutation(mutationOptions.sources.save(ownerId))

  return (
    <Modal title={source ? 'Edit source' : 'Add a source'} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault()

          try {
            await saveSourceMutation.mutateAsync({ data: { id: source?.id, name, url, enabled } })
            onClose()
          } catch {
            /* Mutation state displays the error; keep the form intact. */
          }
        }}
      >
        <label>
          Name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Family, football, work..."
          />
        </label>
        <label>
          Calendar subscription URL
          <input
            required
            type="url"
            maxLength={4096}
            value={url}
            onChange={(event) => setURL(event.target.value)}
            placeholder="https://example.com/calendar.ics"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="hint">
          Use an iCalendar subscription link from your calendar provider. This address stays private
          in your account.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Include this source in calendars
        </label>
        <ErrorMessage error={saveSourceMutation.error} />
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saveSourceMutation.isPending}>
            {saveSourceMutation.isPending ? 'Saving...' : 'Save source'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function OutputForm({
  ownerId,
  output,
  sources,
  onClose,
}: {
  ownerId: string
  output?: Output
  sources: Source[]
  onClose: () => void
}) {
  const [name, setName] = useState(output?.name ?? '')
  const [selected, setSelected] = useState(
    output?.sources.map((source) => ({ sourceId: source.sourceId, prefix: source.prefix })) ?? [],
  )
  const saveOutputMutation = useMutation(mutationOptions.outputs.save(ownerId))

  return (
    <Modal title={output ? 'Edit calendar' : 'Create a calendar'} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault()

          try {
            await saveOutputMutation.mutateAsync({
              data: { id: output?.id, name, sources: selected },
            })
            onClose()
          } catch {
            /* Keep entered values so the owner can retry. */
          }
        }}
      >
        <label>
          Calendar name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Our week"
          />
        </label>
        <fieldset>
          <legend>Sources to include</legend>
          <p className="hint">Choose whole calendars and give each one a title prefix.</p>
          {!sources.length && (
            <p className="empty">Add a source first, or save an empty calendar for later.</p>
          )}
          {sources.map((source) => {
            const membership = selected.find((item) => item.sourceId === source.id)

            return (
              <div className="membership" key={source.id}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(membership)}
                    onChange={(event) => {
                      setSelected((previous) =>
                        event.target.checked
                          ? [...previous, { sourceId: source.id, prefix: '' }]
                          : previous.filter((item) => item.sourceId !== source.id),
                      )
                    }}
                  />
                  {source.name}
                  {!source.enabled && <span className="badge muted">Disabled</span>}
                </label>
                <input
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
        <ErrorMessage error={saveOutputMutation.error} />
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saveOutputMutation.isPending}>
            {saveOutputMutation.isPending ? 'Saving...' : 'Save calendar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CopyLink({ url }: { url: string }) {
  const [message, setMessage] = useState('')

  return (
    <div className="subscription">
      <label className="sr-only" htmlFor={`link-${url.split('/').at(-1)}`}>
        Subscription URL
      </label>
      <input
        id={`link-${url.split('/').at(-1)}`}
        aria-label="Subscription URL"
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setMessage('Copied')
          } catch {
            setMessage('Select the URL to copy it')
          }
        }}
      >
        {message === 'Copied' ? 'Copied ✓' : 'Copy link'}
      </button>
      {message && <output className="sr-only">{message}</output>}
    </div>
  )
}

function Preview({ ownerId, output }: { ownerId: string; output: Output }) {
  const previewQuery = useQuery(queryOptions.outputs.preview(ownerId, output.id))
  const client = useQueryClient()
  useEffect(() => {
    if (previewQuery.dataUpdatedAt) {
      void client.invalidateQueries(queryOptions.calendars.list(ownerId))
    }
  }, [previewQuery.dataUpdatedAt, client, ownerId])

  return (
    <div className="preview">
      <div className="section-header">
        <h3>Event preview</h3>
        <button
          type="button"
          disabled={previewQuery.isFetching}
          onClick={() => previewQuery.refetch()}
        >
          Refresh
        </button>
      </div>
      <p className="hint">
        A sample of events in the feed. Your calendar app expands recurring series.
      </p>
      {previewQuery.isPending && <p>Checking sources...</p>}
      {previewQuery.error && (
        <>
          <ErrorMessage error={previewQuery.error} />
          <button type="button" onClick={() => previewQuery.refetch()}>
            Try again
          </button>
        </>
      )}
      {previewQuery.data && (
        <>
          {previewQuery.data.health
            .filter((source) => source.status !== 'healthy')
            .map((source) => (
              <p className="notice" key={source.id}>
                {source.name}:{' '}
                {source.status === 'stale'
                  ? 'Showing last successful data.'
                  : 'No usable data yet.'}{' '}
                {source.error}
              </p>
            ))}
          {!previewQuery.data.events.length && (
            <p className="empty">No events in this calendar yet.</p>
          )}
          {previewQuery.data.events.map((event, index) => (
            <div className="event-row" key={`${event.uid}-${index}`}>
              <span className="event-date">
                {event.start
                  ? event.allDay
                    ? event.start
                    : new Date(event.start).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                  : 'No start date'}
                {event.allDay && <small>All day</small>}
              </span>
              <div>
                <strong>{event.title}</strong>
                {event.location && <p>{event.location}</p>}
                <div className="tags">
                  {event.recurring && <span>Recurring</span>}
                  {event.exception && <span>Changed instance</span>}
                  {event.cancelled && <span>Cancelled</span>}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function OutputCard({
  ownerId,
  baseURL,
  output,
  sources,
  onEdit,
}: {
  ownerId: string
  baseURL: string
  output: Output
  sources: Source[]
  onEdit: () => void
}) {
  const [preview, setPreview] = useState(false)
  const rotateOutputMutation = useMutation(mutationOptions.outputs.rotate(ownerId))
  const removeOutputMutation = useMutation(mutationOptions.outputs.remove(ownerId))

  return (
    <article className="calendar-card">
      <div className="section-header">
        <div className="calendar-title">
          <span className="calendar-icon" aria-hidden="true">
            ▦
          </span>
          <div>
            <h3>{output.name}</h3>
            <p>
              {output.sources.length} {output.sources.length === 1 ? 'source' : 'sources'} ·
              Read-only subscription
            </p>
          </div>
        </div>
        <button type="button" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div className="source-tags">
        {output.sources.map((membership) => (
          <span key={membership.sourceId}>
            {membership.prefix && `${membership.prefix} `}
            {sources.find((source) => source.id === membership.sourceId)?.name}
          </span>
        ))}
      </div>
      <CopyLink url={`${baseURL}/feed/${output.token}.ics`} />
      <p className="hint">
        Anyone with this link can subscribe. Add it to your calendar app using “Subscribe from URL”.
      </p>
      <div className="card-footer">
        <button
          type="button"
          className="text-button"
          aria-expanded={preview}
          onClick={() => setPreview(!preview)}
        >
          {preview ? 'Hide preview ↑' : 'Preview events ↓'}
        </button>
        <div className="actions">
          <button
            type="button"
            className="text-button"
            disabled={rotateOutputMutation.isPending}
            onClick={() => {
              if (
                window.confirm(
                  'Create a new subscription link? The old link will stop working for every subscriber. You will need to send them the new link.',
                )
              ) {
                rotateOutputMutation.mutate({ data: { id: output.id } })
              }
            }}
          >
            Replace link
          </button>
          <button
            type="button"
            className="text-button danger"
            disabled={removeOutputMutation.isPending}
            onClick={() => {
              if (
                window.confirm(`Delete ${output.name}? Its subscription link will stop working.`)
              ) {
                removeOutputMutation.mutate({ data: { id: output.id } })
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
      <ErrorMessage error={rotateOutputMutation.error ?? removeOutputMutation.error} />
      {preview && <Preview ownerId={ownerId} output={output} />}
    </article>
  )
}

export function CalendarDashboard({ ownerId, baseURL }: { ownerId: string; baseURL: string }) {
  const calendarsQuery = useQuery(queryOptions.calendars.list(ownerId))
  const [sourceEditor, setSourceEditor] = useState<Source | 'new' | null>(null)
  const [outputEditor, setOutputEditor] = useState<Output | 'new' | null>(null)
  const checkSourceMutation = useMutation(mutationOptions.sources.check(ownerId))
  const removeSourceMutation = useMutation(mutationOptions.sources.remove(ownerId))

  if (calendarsQuery.isPending) {
    return <p className="empty">Loading your calendars...</p>
  }

  if (!calendarsQuery.data) {
    return (
      <section className="panel">
        <ErrorMessage error={calendarsQuery.error} />
        <button type="button" onClick={() => calendarsQuery.refetch()}>
          Try again
        </button>
      </section>
    )
  }

  const { sources, outputs } = calendarsQuery.data

  return (
    <>
      <section className="outputs-section">
        <div className="section-header">
          <div>
            <h2>
              Your calendars <span className="count">{outputs.length}</span>
            </h2>
            <p>Bring a few calendars together. Share one simple link.</p>
          </div>
          <button type="button" className="primary" onClick={() => setOutputEditor('new')}>
            + Create calendar
          </button>
        </div>
        {!outputs.length && (
          <div className="empty-card">
            <span aria-hidden="true">☀</span>
            <h3>A clearer view of your week</h3>
            <p>Add your sources below, then combine them into a calendar you can share.</p>
            <button type="button" onClick={() => setOutputEditor('new')}>
              Create your first calendar
            </button>
          </div>
        )}
        <div className="calendar-grid">
          {outputs.map((output) => (
            <OutputCard
              key={output.id}
              ownerId={ownerId}
              baseURL={baseURL}
              output={output}
              sources={sources}
              onEdit={() => setOutputEditor(output)}
            />
          ))}
        </div>
      </section>
      <section className="panel sources-section">
        <div className="section-header">
          <div>
            <h2>
              Sources <span className="count">{sources.length}</span>
            </h2>
            <p>Your original calendar subscriptions, kept in one place.</p>
          </div>
          <button type="button" onClick={() => setSourceEditor('new')}>
            + Add source
          </button>
        </div>
        <p className="hint">
          Status reflects the last check. Sources refresh on demand, at most every 15 minutes.
          Calendar apps choose their own refresh times.
        </p>
        {!sources.length && (
          <p className="empty">
            No sources yet. Grab an iCalendar subscription URL from a calendar you use.
          </p>
        )}
        {sources.map((source) => (
          <article className="source-row" key={source.id}>
            <div className="source-detail">
              <div className="source-name">
                <strong>{source.name}</strong>
                <span
                  className={`badge ${!source.enabled ? 'muted' : source.lastError ? 'warning' : source.lastSuccessAt ? 'good' : 'muted'}`}
                >
                  {!source.enabled
                    ? 'Disabled'
                    : source.lastError
                      ? source.lastSuccessAt
                        ? 'Using older data'
                        : 'Unavailable'
                      : source.lastSuccessAt
                        ? 'Healthy'
                        : 'Not checked'}
                </span>
              </div>
              <p className="source-address">{source.url}</p>
              <p className="hint">
                Last attempt: {time(source.lastAttemptAt)}
                <br />
                Last success: {time(source.lastSuccessAt)}
              </p>
              {source.lastError && <p className="notice">{source.lastError}</p>}
            </div>
            <div className="actions">
              <button
                type="button"
                disabled={!source.enabled || checkSourceMutation.isPending}
                onClick={() => checkSourceMutation.mutate({ data: { id: source.id } })}
              >
                {checkSourceMutation.isPending &&
                checkSourceMutation.variables?.data.id === source.id
                  ? 'Checking...'
                  : 'Check'}
              </button>
              <button type="button" onClick={() => setSourceEditor(source)}>
                Edit
              </button>
              <button
                type="button"
                className="text-button danger"
                disabled={removeSourceMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${source.name}? It will be removed from every calendar that includes it.`,
                    )
                  ) {
                    removeSourceMutation.mutate({ data: { id: source.id } })
                  }
                }}
              >
                Remove
              </button>
            </div>
          </article>
        ))}
        <ErrorMessage error={checkSourceMutation.error ?? removeSourceMutation.error} />
      </section>
      {sourceEditor && (
        <SourceForm
          ownerId={ownerId}
          source={sourceEditor === 'new' ? undefined : sourceEditor}
          onClose={() => setSourceEditor(null)}
        />
      )}
      {outputEditor && (
        <OutputForm
          ownerId={ownerId}
          output={outputEditor === 'new' ? undefined : outputEditor}
          sources={sources}
          onClose={() => setOutputEditor(null)}
        />
      )}
    </>
  )
}
