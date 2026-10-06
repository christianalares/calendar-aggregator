import '@tanstack/react-start/server-only'
import { createCalendarStore } from './calendar-store'
import { db } from './database'

export const calendarStore = createCalendarStore(db)
