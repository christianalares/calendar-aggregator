import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.ts'

export function connectDatabase(url: string) {
  const client = postgres(url, { max: 8, connect_timeout: 10, idle_timeout: 20 })
  const db = drizzle(client, { schema })

  return { db, close: () => client.end({ timeout: 5 }) }
}

export type Database = ReturnType<typeof connectDatabase>['db']
export * from './schema.ts'
