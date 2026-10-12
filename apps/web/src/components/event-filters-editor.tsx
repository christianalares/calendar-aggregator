import { type EventFilterRule, eventFiltersSchema } from '@calendar-aggregator/db/event-filters'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Source } from '@/lib/calendar-types'

export const filterOperators = {
  contains: 'contains',
  equals: 'equals',
  startsWith: 'starts with',
  endsWith: 'ends with',
}
const selectClass =
  'h-10 min-w-0 w-full rounded-md border bg-background px-3 text-sm outline-offset-2'

export function EventFiltersEditor({
  source,
  value,
  onChange,
}: {
  source: Source
  value: EventFilterRule[]
  onChange: (value: EventFilterRule[]) => void
}) {
  const id = useId()
  const [active, setActive] = useState<string | undefined>(value[0]?.id)
  const validation = eventFiltersSchema.safeParse(value)
  const update = (rule: EventFilterRule) =>
    onChange(value.map((item) => (item.id === rule.id ? rule : item)))
  return (
    <section aria-label={`Event filters for ${source.name}`} className="min-w-0 space-y-4">
      <div className="rounded-xl bg-secondary/70 p-4 text-sm text-muted-foreground">
        Events matching any enabled filter are left out of this calendar. Filters match original
        text, before titles change.
      </div>
      {!value.length && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h3 className="font-semibold">Keep the events you want</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything is included until you add a filter.
          </p>
        </div>
      )}
      {value.map((rule, index) => (
        <div key={rule.id} className="min-w-0 overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-2 p-3">
            <Checkbox
              aria-label={`Enable filter ${index + 1}`}
              checked={rule.enabled}
              onCheckedChange={(checked) => update({ ...rule, enabled: Boolean(checked) })}
            />
            <button
              type="button"
              aria-label={`Edit filter ${index + 1}`}
              aria-expanded={active === rule.id}
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              onClick={() => setActive(active === rule.id ? undefined : rule.id)}
            >
              {active === rule.id ? (
                <ChevronDown className="size-4 shrink-0" />
              ) : (
                <ChevronRight className="size-4 shrink-0" />
              )}
              <span className="break-words">
                {rule.value
                  ? `${rule.field} ${filterOperators[rule.operator]} “${rule.value}”`
                  : 'New filter'}
                {!rule.enabled && <span className="ml-2 text-xs text-muted-foreground">Off</span>}
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete filter ${index + 1}`}
              onClick={() => onChange(value.filter((item) => item.id !== rule.id))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          {active === rule.id && (
            <div className="space-y-3 border-t p-4">
              <div className="grid min-w-0 grid-cols-2 gap-3">
                <label className="space-y-1 text-sm">
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
                <label className="space-y-1 text-sm">
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
                    {Object.entries(filterOperators).map(([key, label]) => (
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
                maxLength={500}
                value={rule.value}
                onChange={(event) => update({ ...rule, value: event.target.value })}
              />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer py-1">Match options</summary>
                <Label
                  htmlFor={`${id}-${rule.id}-case`}
                  className="mt-2 flex items-center gap-2 text-xs"
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
                <p className="mt-2">Text is literal, including punctuation and spaces.</p>
              </details>
            </div>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={value.length >= 20}
        onClick={() => {
          const rule: EventFilterRule = {
            id: crypto.randomUUID(),
            enabled: true,
            field: 'title',
            operator: 'contains',
            value: '',
            caseSensitive: false,
          }
          onChange([...value, rule])
          setActive(rule.id)
        }}
      >
        <Plus className="size-4" />
        Add filter
      </Button>
      {!validation.success && (
        <p role="alert" className="text-sm text-destructive">
          {validation.error.issues[0]?.message}
        </p>
      )}
    </section>
  )
}
