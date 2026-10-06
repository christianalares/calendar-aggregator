// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Railway resolves references remotely.
import { defineRailway, github, postgres, project, service } from 'railway/iac'
import { requireProductionTarget } from './targets.ts'

export default defineRailway((context) => {
  requireProductionTarget(context.projectId, context.environmentId)
  const db = postgres('postgres')
  db.networking = { privateNetworkEndpoint: 'postgres' }
  const web = service('web', {
    source: github('christianalares/calendar-aggregator', { branch: 'main' }),
    build: 'pnpm build',
    preDeploy: 'pnpm --filter @calendar-aggregator/db migrate',
    start: 'pnpm --filter @calendar-aggregator/web start',
    healthcheck: '/api/health',
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      APP_URL: 'https://${{RAILWAY_PUBLIC_DOMAIN}}',
      NODE_ENV: 'production',
    },
  })

  // Secrets are configured remotely after initial provisioning, never in this file.
  return project('calendar-aggregator', { resources: [db, web] })
})
