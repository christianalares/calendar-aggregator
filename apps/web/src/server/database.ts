import '@tanstack/react-start/server-only'
import { connectDatabase } from '@calendar-aggregator/db'
import { env } from '../env.server'

export const { db } = connectDatabase(env.DATABASE_URL)
