import '@tanstack/react-start/server-only'
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'
import { envSchema } from './env.generated'

export const env = createEnv({
  server: {
    ...envSchema.shape,
    DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:$/.test(new URL(value).protocol)),
    APP_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    OPERATOR_GOOGLE_EMAIL: z.email().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
  },
  runtimeEnv: { ...process.env },
  emptyStringAsUndefined: true,
})

if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
  throw new Error('Google sign-in requires both client credentials.')
}

if (env.GOOGLE_CLIENT_ID && !env.OPERATOR_GOOGLE_EMAIL) {
  throw new Error('Configure the operator identity before enabling Google sign-in.')
}
