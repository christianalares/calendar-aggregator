import { z } from 'zod'
import { productionTarget } from '../../.railway/targets'

export const variableMap = z.record(z.string().regex(/^[A-Za-z_][A-Za-z_0-9]*$/), z.string())

export function validateTarget(values: Record<string, string>, service: 'web' | 'postgres') {
  if (
    values.RAILWAY_PROJECT_ID !== productionTarget.projectId ||
    values.RAILWAY_ENVIRONMENT_ID !== productionTarget.environmentId ||
    values.RAILWAY_SERVICE_NAME !== service ||
    !z.uuid().safeParse(values.RAILWAY_SERVICE_ID).success
  ) {
    throw new Error(
      'Railway returned configuration for an unexpected project, environment or service.',
    )
  }

  return values.RAILWAY_SERVICE_ID
}

export function privateDatabaseURL(value?: string) {
  const parsed = z.url().safeParse(value)

  if (!parsed.success) {
    throw new Error('The selected service has no valid DATABASE_URL.')
  }
  const url = new URL(parsed.data)

  if (
    !/^postgres(?:ql)?:$/.test(url.protocol) ||
    url.hostname !== 'postgres.railway.internal' ||
    (url.port && url.port !== '5432') ||
    !url.username ||
    !url.password ||
    url.pathname === '/'
  ) {
    throw new Error('DATABASE_URL must reference the registered private PostgreSQL service.')
  }

  return url
}

export function localEnvironment(
  values: Record<string, string>,
  inherited: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'HOME', 'USER', 'TMPDIR', 'LANG', 'TERM']) {
    if (inherited[key]) {
      env[key] = inherited[key]
    }
  }

  return {
    ...env,
    ...values,
    APP_URL: z
      .enum(['http://localhost:3000', 'https://krilles-privat.tailce50d4.ts.net:3000'])
      .parse(inherited.CALENDAR_APP_URL ?? 'http://localhost:3000'),
    NODE_ENV: 'development',
    PORT: '3000',
  }
}
