// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Railway resolves references remotely.
import { defineRailway, github, postgres, preserve, project, service } from 'railway/iac'
import { requireProductionTarget } from './targets.ts'

export default defineRailway((context) => {
  requireProductionTarget(context.projectId, context.environmentId)
  const db = postgres('postgres')
  const browser = service('browser-fetch-poc', {
    source: github('christianalares/calendar-aggregator', { branch: 'main' }),
    root: '/apps/browser-fetch',
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    healthcheck: '/health',
    replicas: { 'europe-west4-drams3a': 1 },
    env: {
      PORT: '3000',
      BROWSER_FETCH_ALLOWED_HOSTS: 'ligaspel.se',
      BROWSER_FETCH_SECRET: preserve(),
    },
  })
  const web = service('web', {
    source: github('christianalares/calendar-aggregator', { branch: 'main' }),
    build: 'pnpm build',
    preDeploy: 'pnpm --filter @calendar-aggregator/db migrate',
    start: 'pnpm --filter @calendar-aggregator/web start',
    healthcheck: '/api/health',
    deploy: { ipv6EgressEnabled: true },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      APP_URL: 'https://cal-pal.app',
      NODE_ENV: 'production',
      BROWSER_FETCH_URL: 'http://${{browser-fetch-poc.RAILWAY_PRIVATE_DOMAIN}}:3000',
      BROWSER_FETCH_SECRET: browser.env.BROWSER_FETCH_SECRET,
      BETTER_AUTH_SECRET: preserve(),
      OPERATOR_GOOGLE_EMAIL: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
    },
  })

  // Secrets are configured remotely after initial provisioning, never in this file.
  return project('calendar-aggregator', { resources: [db, browser, web] })
})
