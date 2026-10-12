import { eventFiltersSchema } from '@calendar-aggregator/db/event-filters'
import { titleFormattingSchema } from '@calendar-aggregator/db/title-formatting'
import { z } from 'zod'

const name = z.string().trim().min(1, 'Enter a name.').max(100)
export const previewRangeInput = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    timeZone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value })
          return true
        } catch {
          return false
        }
      }, 'Invalid time zone.'),
  })
  .refine(({ from, to }) => {
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
    return days > 0 && days <= 62
  }, 'Choose a preview range of up to two months.')
export type PreviewRange = z.infer<typeof previewRangeInput>

export const sourceInput = z.object({
  id: z.uuid().optional(),
  name,
  url: z
    .url()
    .max(4096)
    .refine(
      (value) => ['https:', 'http:'].includes(new URL(value).protocol),
      'Use an HTTPS or HTTP subscription URL.',
    ),
  enabled: z.boolean(),
  useBrowser: z.boolean().default(false),
})
export const outputInput = z.object({
  id: z.uuid().optional(),
  name,
  sources: z
    .array(
      z.object({
        sourceId: z.uuid(),
        prefix: z.string().max(100).optional(),
        titleFormatting: titleFormattingSchema.optional(),
        eventFilters: eventFiltersSchema.optional(),
      }),
    )
    .max(100)
    .refine(
      (items) => new Set(items.map((item) => item.sourceId)).size === items.length,
      'Include each source once.',
    ),
})
