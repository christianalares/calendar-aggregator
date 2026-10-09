import { z } from 'zod'

export const eventFilterRuleSchema = z.object({
  id: z.string().min(1).max(64),
  enabled: z.boolean(),
  field: z.enum(['title', 'description', 'location']),
  operator: z.enum(['contains', 'equals', 'startsWith', 'endsWith']),
  value: z
    .string()
    .max(500)
    .refine((value) => value.trim().length > 0, 'Enter text to match.'),
  caseSensitive: z.boolean(),
})

export const eventFiltersSchema = z
  .array(eventFilterRuleSchema)
  .max(20)
  .refine(
    (rules) => new Set(rules.map((rule) => rule.id)).size === rules.length,
    'Use unique filter identities.',
  )

export type EventFilterRule = z.infer<typeof eventFilterRuleSchema>
export type EventFilterText = Record<EventFilterRule['field'], string>

/** Literal matching against original event properties. Any enabled match excludes the event. */
export function matchEventFilter(event: EventFilterText, rules: EventFilterRule[]) {
  return rules.find((rule) => {
    if (!rule.enabled || !rule.value.trim()) return false
    const normalize = (value: string) => {
      const text = value.normalize('NFC')
      return rule.caseSensitive ? text : text.toLowerCase()
    }
    const text = normalize(event[rule.field])
    const value = normalize(rule.value)
    switch (rule.operator) {
      case 'contains':
        return text.includes(value)
      case 'equals':
        return text === value
      case 'startsWith':
        return text.startsWith(value)
      case 'endsWith':
        return text.endsWith(value)
    }
    return false
  })
}
