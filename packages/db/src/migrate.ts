import { fileURLToPath } from 'node:url'
import { createEnv } from '@t3-oss/env-core'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { z } from 'zod'
import { connectDatabase } from './index.ts'

const env = createEnv({
  server: {
    DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:$/.test(new URL(value).protocol)),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
const connection = connectDatabase(env.DATABASE_URL)

try {
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  })
  console.info('Database migrations completed.')
} catch {
  console.error('Database migration failed. Check database access and the migration history.')
  process.exitCode = 1
} finally {
  await connection.close()
}
