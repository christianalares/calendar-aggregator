import { eventFiltersSchema } from '@calendar-aggregator/db/event-filters'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { outputInput, sourceInput } from '../lib/calendar-inputs'
import { CalendarError } from '../lib/errors'
import type { createCalendarStore } from '../server/calendar-store'
import { withAuthMiddleware } from './middlewares/with-auth'

const idInput = z.object({ id: z.uuid() })

async function operation<T>(
  callback: (store: ReturnType<typeof createCalendarStore>) => Promise<T>,
) {
  try {
    const { calendarStore } = await import('../server/calendar-service')

    return await callback(calendarStore)
  } catch (error) {
    throw new Error(
      error instanceof CalendarError
        ? error.message
        : 'Could not update your calendars. Please try again.',
    )
  }
}

export const listCalendars = createServerFn({ method: 'GET' })
  .middleware([withAuthMiddleware])
  .handler(({ context }) => operation((store) => store.list(context.user.id)))
export const previewFilters = createServerFn({ method: 'POST' })
  .middleware([withAuthMiddleware])
  .validator(z.object({ sourceId: z.uuid(), rules: eventFiltersSchema }))
  .handler(({ context, data }) =>
    operation((store) => store.previewFilters(context.user.id, data.sourceId, data.rules)),
  )
export const saveSource = createServerFn({ method: 'POST' })
  .middleware([withAuthMiddleware])
  .validator(sourceInput)
  .handler(({ context, data }) => operation((store) => store.saveSource(context.user.id, data)))
export const removeSource = createServerFn({ method: 'POST' })
  .middleware([withAuthMiddleware])
  .validator(idInput)
  .handler(({ context, data }) =>
    operation((store) => store.removeSource(context.user.id, data.id)),
  )
export const saveOutput = createServerFn({ method: 'POST' })
  .middleware([withAuthMiddleware])
  .validator(outputInput)
  .handler(({ context, data }) => operation((store) => store.saveOutput(context.user.id, data)))
export const removeOutput = createServerFn({ method: 'POST' })
  .middleware([withAuthMiddleware])
  .validator(idInput)
  .handler(({ context, data }) =>
    operation((store) => store.removeOutput(context.user.id, data.id)),
  )
export const rotateOutput = createServerFn({ method: 'POST' })
  .middleware([withAuthMiddleware])
  .validator(idInput)
  .handler(({ context, data }) =>
    operation((store) => store.rotateOutput(context.user.id, data.id)),
  )
