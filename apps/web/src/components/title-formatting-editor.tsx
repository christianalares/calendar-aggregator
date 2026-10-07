import {
  type CapturePart,
  formatTitle,
  type MatchPart,
  matchTitle,
  type ShowPart,
  type TitleFormatting,
  type TitleRule,
  titleFormattingSchema,
  titleRuleSchema,
} from '@calendar-aggregator/db/title-formatting'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const text = (value: string): MatchPart & ShowPart => ({
  kind: 'text',
  value,
  id: crypto.randomUUID(),
})

export function withTextIds(settings: TitleFormatting): TitleFormatting {
  const identify = <T extends MatchPart | ShowPart>(part: T): T =>
    part.kind === 'text' && !part.id ? { ...part, id: crypto.randomUUID() } : part
  return {
    ...settings,
    rules: settings.rules.map((rule) => ({
      ...rule,
      match: rule.match.map(identify),
      show: rule.show.map(identify),
    })),
  }
}
const reference = (captureId: string): ShowPart => ({
  kind: 'reference',
  captureId,
  format: 'original',
})
const selectClass = 'h-8 w-full rounded-md border border-input bg-background px-2 text-xs'

function summary(rule: TitleRule) {
  const describe = (parts: (MatchPart | ShowPart)[]) =>
    parts
      .map((part) => {
        if (part.kind === 'text') return part.value
        const name =
          part.kind === 'capture'
            ? part.name
            : rule.match.find(
                (capture): capture is CapturePart =>
                  capture.kind === 'capture' && capture.id === part.captureId,
              )?.name
        return `[${name ?? 'Text'}]`
      })
      .join('')
  return `${describe(rule.match)} → ${describe(rule.show)}`
}

function CaptureSettings({
  capture,
  onChange,
}: {
  capture: CapturePart
  onChange: (capture: CapturePart) => void
}) {
  const id = useId()
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`${id}-name`}>Capture name</Label>
        <Input
          id={`${id}-name`}
          className="h-8 text-xs"
          maxLength={40}
          value={capture.name}
          onChange={(event) => onChange({ ...capture, name: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-type`}>Matches</Label>
        <select
          id={`${id}-type`}
          className={selectClass}
          value={capture.type}
          onChange={(event) =>
            onChange({ ...capture, type: event.target.value as CapturePart['type'] })
          }
        >
          <option value="text">Any text, including spaces</option>
          <option value="word">One word</option>
          <option value="digits">Digits</option>
        </select>
      </div>
    </div>
  )
}

function PatternComposer({
  mode,
  rule,
  onChange,
}: {
  mode: 'match' | 'show'
  rule: TitleRule
  onChange: (rule: TitleRule) => void
}) {
  const [insertOpen, setInsertOpen] = useState(false)
  const parts = rule[mode]
  const captures = rule.match.filter((part) => part.kind === 'capture')
  const setParts = (next: (MatchPart | ShowPart)[]) =>
    onChange(
      mode === 'match'
        ? { ...rule, match: next as MatchPart[] }
        : { ...rule, show: next as ShowPart[] },
    )
  const move = (index: number, direction: number) => {
    const next = [...parts]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setParts(next)
  }
  const remove = (index: number) => {
    const part = parts[index]
    if (part.kind === 'capture')
      onChange({
        ...rule,
        match: rule.match.filter((_, item) => item !== index),
        show: rule.show.filter((item) => item.kind !== 'reference' || item.captureId !== part.id),
      })
    else setParts(parts.filter((_, item) => item !== index))
  }
  return (
    <fieldset
      className="flex min-h-10 min-w-0 flex-wrap items-center gap-1 rounded-lg border bg-card px-2 py-1"
      aria-label={`${mode === 'match' ? 'Match' : 'Show'} pattern for ${rule.name}`}
    >
      {parts.map((part, index) => {
        if (part.kind === 'text')
          return (
            <input
              key={part.id}
              aria-label={`${mode === 'match' ? 'Match' : 'Show'} text ${index + 1} for ${rule.name}`}
              value={part.value}
              maxLength={500}
              style={{ width: `${Math.max(3, part.value.length + 1)}ch` }}
              className="min-w-6 max-w-full flex-[0_1_auto] rounded-sm bg-transparent px-1 py-1 text-sm outline-offset-2"
              onChange={(event) =>
                setParts(
                  parts.map((item, at) =>
                    at === index ? { ...part, value: event.target.value } : item,
                  ),
                )
              }
            />
          )
        const capture =
          part.kind === 'capture' ? part : captures.find((item) => item.id === part.captureId)
        return (
          <Popover key={part.kind === 'capture' ? part.id : `reference-${index}`}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground"
                  aria-label={`Edit ${capture?.name ?? 'missing capture'} ${mode === 'match' ? 'capture' : 'output'}`}
                />
              }
            >
              <span className="break-words">{capture?.name ?? 'Missing capture'}</span>
              <ChevronDown aria-hidden="true" className="size-3 shrink-0" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-3">
              {part.kind === 'capture' && (
                <CaptureSettings
                  capture={part}
                  onChange={(updated) =>
                    onChange({
                      ...rule,
                      match: rule.match.map((item) =>
                        item.kind === 'capture' && item.id === part.id ? updated : item,
                      ),
                    })
                  }
                />
              )}
              {part.kind === 'reference' && (
                <label className="space-y-1 text-xs font-medium">
                  Show captured text
                  <select
                    className={selectClass}
                    value={part.format}
                    onChange={(event) =>
                      setParts(
                        parts.map((item, at) =>
                          at === index
                            ? { ...part, format: event.target.value as typeof part.format }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="original">Original case</option>
                    <option value="upper">UPPERCASE</option>
                    <option value="lower">lowercase</option>
                  </select>
                </label>
              )}
              <div className="flex items-center gap-1 border-t pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move token left"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="-rotate-90" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move token right"
                  disabled={index === parts.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="-rotate-90" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive"
                  onClick={() => remove(index)}
                >
                  <Trash2 />
                  Remove
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )
      })}
      <Popover open={insertOpen} onOpenChange={setInsertOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={mode === 'match' ? 'Add capture or text' : 'Insert capture or text'}
              className="size-6"
            />
          }
        >
          <Plus className="size-3" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56">
          <p className="text-xs font-medium">
            {mode === 'match' ? 'Add to pattern' : 'Insert into title'}
          </p>
          {mode === 'show' &&
            captures.map((capture) => (
              <Button
                key={capture.id}
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => {
                  setParts([...parts, reference(capture.id)])
                  setInsertOpen(false)
                }}
              >
                {capture.name}
              </Button>
            ))}
          {mode === 'match' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              disabled={captures.length >= 8}
              onClick={() => {
                setParts([
                  ...parts,
                  {
                    kind: 'capture',
                    id: crypto.randomUUID(),
                    name: `Text ${captures.length + 1}`,
                    type: 'text',
                  },
                ])
                setInsertOpen(false)
              }}
            >
              Captured text
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => {
              setParts([...parts, text(' ')])
              setInsertOpen(false)
            }}
          >
            Plain text
          </Button>
        </PopoverContent>
      </Popover>
    </fieldset>
  )
}

function captureSelection(
  rule: TitleRule,
  sample: string,
  selection: { start: number; end: number },
): TitleRule {
  const capture: CapturePart = {
    kind: 'capture',
    id: crypto.randomUUID(),
    name: `Text ${rule.match.filter((part) => part.kind === 'capture').length + 1}`,
    type: 'text',
  }
  const spans = (matchTitle(sample, rule) ?? [])
    .filter((span) => span.end <= selection.start || span.start >= selection.end)
    .map((span) => ({
      ...span,
      capture: rule.match.find(
        (part): part is CapturePart => part.kind === 'capture' && part.id === span.id,
      ) as CapturePart,
    }))
  spans.push({
    ...selection,
    id: capture.id,
    name: capture.name,
    value: sample.slice(selection.start, selection.end),
    capture,
  })
  spans.sort((left, right) => left.start - right.start)
  const match: MatchPart[] = []
  let offset = 0
  for (const span of spans) {
    if (span.start > offset) match.push(text(sample.slice(offset, span.start)))
    match.push(span.capture)
    offset = span.end
  }
  if (offset < sample.length) match.push(text(sample.slice(offset)))
  const valid = new Set(spans.map((span) => span.id))
  const show = rule.show.map((part) =>
    part.kind === 'reference' && !valid.has(part.captureId) ? reference(capture.id) : part,
  )
  if (!show.some((part) => part.kind === 'reference')) show.push(reference(capture.id))
  return { ...rule, match, show }
}

export function TitleFormattingEditor({
  sourceName,
  value,
  sampleTitles,
  onChange,
}: {
  sourceName: string
  value: TitleFormatting
  sampleTitles: string[]
  onChange: (value: TitleFormatting) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | undefined>(value.rules[0]?.id)
  const [sample, setSample] = useState(sampleTitles[0] ?? '')
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const updateRule = (rule: TitleRule) =>
    onChange({ ...value, rules: value.rules.map((item) => (item.id === rule.id ? rule : item)) })
  const validation = titleFormattingSchema.safeParse(value)
  const result = validation.success ? formatTitle(sample, value) : undefined
  const activeRule = value.rules.find((rule) => rule.id === active)
  const ruleValidation = activeRule ? titleRuleSchema.safeParse(activeRule) : undefined
  const addRule = () => {
    const rule: TitleRule = {
      id: crypto.randomUUID(),
      name: 'Rename event',
      enabled: true,
      caseSensitive: false,
      match: [text(sample)],
      show: [text(sample)],
    }
    onChange({ ...value, rules: [...value.rules, rule] })
    setActive(rule.id)
    setOpen(true)
  }
  const reorder = (index: number, direction: number) => {
    const rules = [...value.rules]
    ;[rules[index], rules[index + direction]] = [rules[index + direction], rules[index]]
    onChange({ ...value, rules })
  }
  return (
    <section
      aria-label={`Title formatting for ${sourceName}`}
      className="min-w-0 space-y-3 rounded-xl bg-secondary/70 p-3"
    >
      <div className="grid min-w-0 items-center gap-2 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
        <span className="text-xs font-medium text-muted-foreground">Title format</span>
        <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border bg-card px-2 py-1">
          <input
            aria-label={`Text before title for ${sourceName}`}
            value={value.before}
            maxLength={500}
            placeholder="Prefix"
            style={{ width: `${Math.max(6, value.before.length + 1)}ch` }}
            className="min-w-8 max-w-full flex-[0_1_auto] rounded-sm bg-transparent px-1 py-1 text-sm outline-offset-2"
            onChange={(event) => onChange({ ...value, before: event.target.value })}
          />
          <span className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
            Event title
          </span>
          <input
            aria-label={`Text after title for ${sourceName}`}
            value={value.after}
            maxLength={500}
            placeholder="Suffix"
            style={{ width: `${Math.max(6, value.after.length + 1)}ch` }}
            className="min-w-8 max-w-full flex-[0_1_auto] rounded-sm bg-transparent px-1 py-1 text-sm outline-offset-2"
            onChange={(event) => onChange({ ...value, after: event.target.value })}
          />
        </div>
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-rules`}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}Rename
        rules
        <span className="ml-1 rounded bg-card px-1.5 py-0.5 text-[11px]">{value.rules.length}</span>
      </button>
      {open && (
        <div id={`${id}-rules`} className="space-y-2">
          {value.rules.map((rule, index) => (
            <div key={rule.id} className="min-w-0 rounded-lg border bg-card">
              <div className="flex items-center gap-1 px-2 py-1.5">
                <Checkbox
                  aria-label={`Enable ${rule.name}`}
                  checked={rule.enabled}
                  onCheckedChange={(enabled) => updateRule({ ...rule, enabled: Boolean(enabled) })}
                />
                <button
                  type="button"
                  aria-expanded={active === rule.id}
                  aria-label={`Edit rule ${rule.name}`}
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1 text-left text-xs font-medium"
                  onClick={() => {
                    setActive(active === rule.id ? undefined : rule.id)
                    setSelection(null)
                    const example = sampleTitles.find((title) => matchTitle(title, rule))
                    if (example) setSample(example)
                  }}
                >
                  {active === rule.id ? (
                    <ChevronDown className="size-3 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0" />
                  )}
                  <span className="break-words">{rule.name}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${rule.name} up`}
                  disabled={index === 0}
                  onClick={() => reorder(index, -1)}
                >
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${rule.name} down`}
                  disabled={index === value.rules.length - 1}
                  onClick={() => reorder(index, 1)}
                >
                  <ArrowDown className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${rule.name}`}
                  onClick={() => {
                    onChange({ ...value, rules: value.rules.filter((item) => item.id !== rule.id) })
                    if (active === rule.id) setActive(undefined)
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
              {active === rule.id ? (
                <div className="space-y-2 border-t p-3">
                  <Input
                    aria-label="Rule name"
                    className="h-8 text-xs"
                    maxLength={80}
                    value={rule.name}
                    onChange={(event) => updateRule({ ...rule, name: event.target.value })}
                  />
                  {(['match', 'show'] as const).map((mode) => (
                    <div
                      key={mode}
                      className="grid min-w-0 gap-1 sm:grid-cols-[3rem_minmax(0,1fr)] sm:items-start"
                    >
                      <span className="text-xs text-muted-foreground sm:pt-3">
                        {mode === 'match' ? 'Match' : 'Show'}
                      </span>
                      <PatternComposer mode={mode} rule={rule} onChange={updateRule} />
                    </div>
                  ))}
                  <Label
                    htmlFor={`${id}-${rule.id}-case`}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <Checkbox
                      id={`${id}-${rule.id}-case`}
                      checked={rule.caseSensitive}
                      onCheckedChange={(checked) =>
                        updateRule({ ...rule, caseSensitive: Boolean(checked) })
                      }
                    />
                    Match case
                  </Label>
                  {ruleValidation && !ruleValidation.success && (
                    <p role="alert" className="text-xs text-destructive">
                      {ruleValidation.error.issues[0]?.message}
                    </p>
                  )}
                </div>
              ) : (
                <p className="break-words border-t px-3 py-2 text-xs text-muted-foreground">
                  {summary(rule)}
                </p>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-0 text-primary"
              disabled={value.rules.length >= 20}
              onClick={addRule}
            >
              <Plus className="size-3" />
              Add rule
            </Button>
            <span className="text-[11px] text-muted-foreground">
              First match wins · whole title · flexible spaces
            </span>
          </div>
        </div>
      )}
      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={`${id}-sample`} className="text-xs text-muted-foreground">
            Try a title
          </Label>
          {open && activeRule && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-0 text-xs text-primary"
              disabled={!selection}
              onClick={() => {
                if (selection) updateRule(captureSelection(activeRule, sample, selection))
                setSelection(null)
              }}
            >
              Capture selection
            </Button>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input
            id={`${id}-sample`}
            className="h-8 min-w-0 flex-1 basis-44 text-xs"
            placeholder="An event title from this source"
            maxLength={4096}
            value={sample}
            onChange={(event) => {
              setSample(event.target.value)
              setSelection(null)
            }}
            onSelect={(event) => {
              const { selectionStart, selectionEnd } = event.currentTarget
              setSelection(
                selectionStart !== null && selectionEnd !== null && selectionEnd > selectionStart
                  ? { start: selectionStart, end: selectionEnd }
                  : null,
              )
            }}
          />
          {sampleTitles.length > 0 && (
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Choose an example from ${sourceName}`}
                  />
                }
              >
                <ChevronDown className="size-3" />
              </PopoverTrigger>
              <PopoverContent align="end" className="max-h-64 w-72 overflow-y-auto">
                {sampleTitles.map((title) => (
                  <Button
                    key={title}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto justify-start whitespace-normal text-left text-xs"
                    onClick={() => {
                      setSample(title)
                      setSelection(null)
                    }}
                  >
                    {title}
                  </Button>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
        <div aria-live="polite" className="space-y-1">
          <div className="flex min-w-0 items-start gap-2 text-sm">
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="break-words font-medium">
              {result?.title ||
                (sample
                  ? 'Resolve the rule above to preview.'
                  : 'Your formatted title appears here')}
            </span>
          </div>
          {open && result && (
            <p
              className={cn(
                'break-words pl-6 text-[11px]',
                result.matchedRule ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {result.matchedRule
                ? `${result.matchedRule.name}${result.captures.length ? ` · ${result.captures.map((capture) => `${capture.name} = ${capture.value}`).join(' · ')}` : ''}`
                : 'No matching rule · original title used'}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
