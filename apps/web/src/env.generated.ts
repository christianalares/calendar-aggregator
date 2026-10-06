// Generated from environment variable names; no values. Do not edit.
import { z } from 'zod'

export const envSchema = z.object({
  "APP_URL": z.string(),
  "BETTER_AUTH_SECRET": z.string(),
  "DATABASE_URL": z.string(),
  "NODE_ENV": z.string(),
  "OPERATOR_GOOGLE_EMAIL": z.string(),
  "RAILWAY_ENVIRONMENT": z.string().optional(),
  "RAILWAY_ENVIRONMENT_ID": z.string().optional(),
  "RAILWAY_ENVIRONMENT_NAME": z.string().optional(),
  "RAILWAY_PRIVATE_DOMAIN": z.string().optional(),
  "RAILWAY_PROJECT_ID": z.string().optional(),
  "RAILWAY_PROJECT_NAME": z.string().optional(),
  "RAILWAY_PUBLIC_DOMAIN": z.string().optional(),
  "RAILWAY_SERVICE_ID": z.string().optional(),
  "RAILWAY_SERVICE_NAME": z.string().optional(),
  "RAILWAY_SERVICE_WEB_URL": z.string().optional(),
  "RAILWAY_STATIC_URL": z.string().optional(),
})
