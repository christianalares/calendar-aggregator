import '@tanstack/react-start/server-only'
import { env } from '../env.server'
import { createSourceFetcher } from './browser-fetch'
import { db } from './database'
import { createFeedService } from './feeds'

export const feedService = createFeedService(
  db,
  createSourceFetcher({
    url: env.BROWSER_FETCH_URL,
    secret: env.BROWSER_FETCH_SECRET,
  }),
)
