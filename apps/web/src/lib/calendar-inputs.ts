import { z } from 'zod'

const name = z.string().trim().min(1, 'Enter a name.').max(100)
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
})
export const outputInput = z.object({
  id: z.uuid().optional(),
  name,
  sources: z
    .array(z.object({ sourceId: z.uuid(), prefix: z.string().max(100) }))
    .max(100)
    .refine(
      (items) => new Set(items.map((item) => item.sourceId)).size === items.length,
      'Include each source once.',
    ),
})
