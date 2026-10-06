import '@tanstack/react-start/server-only'
import { db } from './database'
import { createFeedService } from './feeds'

export const feedService = createFeedService(db)
