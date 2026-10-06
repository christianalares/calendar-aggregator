import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { CalendarError } from '../server/calendar-store'
import { feedService } from '../server/feed-service'
import { FeedUnavailable } from '../server/feeds'
import { withAuthMiddleware } from './middlewares/with-auth'

export const previewOutput = createServerFn({ method: 'GET' })
  .middleware([withAuthMiddleware])
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ context, data }) => {
    try {
      return await feedService.preview(context.user.id, data.id)
    } catch (error) {
      throw new Error(
        error instanceof CalendarError || error instanceof FeedUnavailable
          ? error.message
          : 'Could not load the preview. Please try again.',
      )
    }
  })

export const checkSource = createServerFn({ method: 'POST' })
  .middleware([withAuthMiddleware])
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ context, data }) => {
    try {
      return await feedService.checkSource(context.user.id, data.id)
    } catch (error) {
      throw new Error(
        error instanceof CalendarError
          ? error.message
          : 'Could not check this source. Please try again.',
      )
    }
  })
