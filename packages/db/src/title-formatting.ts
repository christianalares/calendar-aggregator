import { z } from 'zod'

const identifier = z.string().min(1).max(64)
const text = z.object({
  kind: z.literal('text'),
  value: z.string().max(500),
  id: identifier.optional(),
})
const capture = z.object({
  kind: z.literal('capture'),
  id: identifier,
  name: z.string().trim().min(1, 'Name the captured text.').max(40),
  type: z.enum(['text', 'word', 'digits']),
})
const reference = z.object({
  kind: z.literal('reference'),
  captureId: identifier,
  format: z.enum(['original', 'upper', 'lower']),
})

export const titleRuleSchema = z
  .object({
    id: identifier,
    name: z.string().trim().min(1, 'Name the rule.').max(80),
    enabled: z.boolean(),
    caseSensitive: z.boolean(),
    match: z
      .array(z.discriminatedUnion('kind', [text, capture]))
      .min(1)
      .max(32),
    show: z
      .array(z.discriminatedUnion('kind', [text, reference]))
      .min(1)
      .max(32),
  })
  .superRefine((rule, context) => {
    const parts = rule.match.filter((part) => part.kind !== 'text' || part.value.length > 0)
    const captures = parts.filter((part) => part.kind === 'capture')
    const ids = new Set(captures.map((part) => part.id))
    const error = (message: string) => context.addIssue({ code: 'custom', message })
    if (!parts.length) error('Enter a title pattern.')
    if (captures.length > 8) error('Use up to eight captures in a rule.')
    if (ids.size !== captures.length) error('Each capture must have its own identity.')
    if (new Set(captures.map((part) => part.name.toLowerCase())).size !== captures.length)
      error('Give each capture a different name.')
    if (
      parts.some((part, index) => part.kind === 'capture' && parts[index + 1]?.kind === 'capture')
    )
      error('Put fixed text between captures so their boundaries are clear.')
    if (rule.show.some((part) => part.kind === 'reference' && !ids.has(part.captureId)))
      error('The new title refers to a capture that no longer exists.')
    if (!rule.show.some((part) => part.kind === 'reference' || part.value.trim().length > 0))
      error('Enter the new title.')
  })

export const titleFormattingSchema = z.object({
  before: z.string().max(500),
  after: z.string().max(500),
  rules: z
    .array(titleRuleSchema)
    .max(20)
    .refine(
      (rules) => new Set(rules.map((rule) => rule.id)).size === rules.length,
      'Use unique rule identities.',
    ),
})

export type TitleFormatting = z.infer<typeof titleFormattingSchema>
export type TitleRule = z.infer<typeof titleRuleSchema>
export type MatchPart = TitleRule['match'][number]
export type ShowPart = TitleRule['show'][number]
export type CapturePart = Extract<MatchPart, { kind: 'capture' }>

export function titleFormattingFromPrefix(prefix = ''): TitleFormatting {
  return { before: prefix ? `${prefix} ` : '', after: '', rules: [] }
}

function literal(value: string, caseSensitive: boolean, anchored: boolean) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`${anchored ? '^' : ''}${escaped}`, caseSensitive ? 'u' : 'iu')
}

/** Full-title matching. A capture ends at the first following literal, without backtracking. */
export function matchTitle(title: string, rule: TitleRule) {
  if (title.length > 4096) return null
  const parts = rule.match.filter((part) => part.kind !== 'text' || part.value.length > 0)
  const captures: { id: string; name: string; value: string; start: number; end: number }[] = []
  let offset = 0

  for (const [index, part] of parts.entries()) {
    if (part.kind === 'text') {
      const match = literal(part.value, rule.caseSensitive, true).exec(title.slice(offset))
      if (!match) return null
      offset += match[0].length
      continue
    }
    const next = parts[index + 1]
    if (next?.kind === 'capture') return null
    const boundary = next
      ? literal(next.value, rule.caseSensitive, false).exec(title.slice(offset))
      : null
    if (next && !boundary) return null
    const end = next ? offset + (boundary?.index ?? 0) : title.length
    const value = title.slice(offset, end).trim()
    if (
      !value ||
      (part.type === 'word' && /\s/u.test(value)) ||
      (part.type === 'digits' && !/^[0-9]+$/.test(value))
    )
      return null
    captures.push({ id: part.id, name: part.name, value, start: offset, end })
    offset = end
  }
  if (!parts.length || offset !== title.length) return null
  return captures
}

export function formatTitle(title: string, settings: TitleFormatting) {
  let renamed = title
  let matchedRule: TitleRule | undefined
  let captures: NonNullable<ReturnType<typeof matchTitle>> = []
  for (const rule of settings.rules) {
    if (!rule.enabled) continue
    const match = matchTitle(title, rule)
    if (!match) continue
    captures = match
    matchedRule = rule
    renamed = rule.show
      .map((part) => {
        if (part.kind === 'text') return part.value
        const value = captures.find((capture) => capture.id === part.captureId)?.value ?? ''
        return part.format === 'upper'
          ? value.toUpperCase()
          : part.format === 'lower'
            ? value.toLowerCase()
            : value
      })
      .join('')
    break
  }
  return { title: `${settings.before}${renamed}${settings.after}`, renamed, matchedRule, captures }
}
