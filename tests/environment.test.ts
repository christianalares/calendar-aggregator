import { describe, expect, it } from 'vitest'
import { productionTarget } from '../.railway/targets'
import { renderSchema } from '../scripts/railway/generate-env'
import {
  localEnvironment,
  privateDatabaseURL,
  validateTarget,
  variableMap,
} from '../scripts/railway/local-config'

describe('Railway startup configuration', () => {
  it('generates names only and accepts optional Railway metadata', () => {
    const values = {
      DATABASE_URL: 'postgres://user:secret@host/db',
      BETTER_AUTH_SECRET: 'private-auth-secret',
      RAILWAY_PROJECT_ID: productionTarget.projectId,
    }
    const schema = renderSchema(Object.keys(values))
    expect(schema).toContain('"DATABASE_URL": z.string()')
    expect(schema).toContain('"RAILWAY_PROJECT_ID": z.string().optional()')
    expect(schema).not.toContain(values.DATABASE_URL)
    expect(schema).not.toContain(values.BETTER_AUTH_SECRET)
    expect(() => variableMap.parse({ DATABASE_URL: 42 })).toThrow()
  })
  it('rejects wrong target metadata and unexpected database destinations', () => {
    const values = {
      RAILWAY_PROJECT_ID: productionTarget.projectId,
      RAILWAY_ENVIRONMENT_ID: productionTarget.environmentId,
      RAILWAY_SERVICE_NAME: 'web',
      RAILWAY_SERVICE_ID: 'b4590a5e-5584-4189-9404-ddf3b7059d48',
    }
    expect(validateTarget(values, 'web')).toBe(values.RAILWAY_SERVICE_ID)
    expect(() => validateTarget({ ...values, RAILWAY_ENVIRONMENT_ID: 'other' }, 'web')).toThrow(
      'unexpected',
    )
    expect(() => validateTarget(values, 'postgres')).toThrow('unexpected')
    expect(
      privateDatabaseURL('postgres://user:password@postgres.railway.internal:5432/railway')
        .hostname,
    ).toBe('postgres.railway.internal')
    expect(() =>
      privateDatabaseURL('postgres://user:password@other.railway.internal:5432/railway'),
    ).toThrow('registered')
    expect(() => privateDatabaseURL('postgres://user:password@localhost:5432/railway')).toThrow(
      'registered',
    )
  })
  it('passes remote configuration in memory without forwarding local tool credentials', () => {
    const env = localEnvironment(
      { BETTER_AUTH_SECRET: 'remote-secret', APP_URL: 'https://production.test' },
      {
        PATH: '/usr/bin',
        HOME: '/tmp',
        RAILWAY_TOKEN: 'local-tool-secret',
        BETTER_AUTH_SECRET: 'wrong-local-secret',
      },
    )
    expect(env.APP_URL).toBe('http://localhost:3000')
    expect(env.BETTER_AUTH_SECRET).toBe('remote-secret')
    expect(env.RAILWAY_TOKEN).toBeUndefined()
  })
  it('uses the selected Tailscale origin and rejects unexpected local origins', () => {
    const origin = 'https://krilles-privat.tailce50d4.ts.net:3000'
    expect(localEnvironment({}, { CALENDAR_APP_URL: origin }).APP_URL).toBe(origin)
    expect(() => localEnvironment({}, { CALENDAR_APP_URL: 'https://untrusted.example' })).toThrow()
  })
})
