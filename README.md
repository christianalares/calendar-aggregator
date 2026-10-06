# Calendar Club

A small, invite-only calendar aggregator. Combine external iCalendar subscriptions into read-only calendars, then share their private subscription URLs with friends.

The initial app uses TanStack Start and Better Auth in `apps/web`, PostgreSQL and Drizzle in `packages/db`, and pnpm/Turborepo at the root. Decisions and scope live in [the build specification](docs/build-spec.md).

## Development

Install Node.js 24 and pnpm 12, then run `pnpm install`.

The normal local environment comes from the registered Railway **production** web service. It uses that shared production database, so select the target explicitly:

```sh
railway login
pnpm dev --environment production
```

Startup reads service variables using the Railway CLI, verifies project/environment/service metadata, generates `apps/web/src/env.generated.ts` from variable **names only**, and opens an authenticated SSH tunnel to the private PostgreSQL service. Values remain in memory and pass to the child process. No dotenv files are written or loaded. T3 Env validates the app's server configuration.

Register your SSH public key with Railway and trust its SSH host through the normal interactive SSH setup first. `CALENDAR_SSH_IDENTITY` can select a specific private-key file. The launcher checks the selected database's URL, SSH target and database identity before starting the app. It stops its tunnel when the app stops.

```sh
pnpm env:generate --environment production
pnpm db:generate
pnpm db:migrate --environment production
pnpm build
pnpm check-types
pnpm lint
```

Only run migrations after reviewing the generated SQL and selecting the intended database. Railway deployment runs `pnpm --filter @calendar-aggregator/db migrate` using its injected server environment, without the local SSH launcher.

The committed generated schema starts with the required app contract. Regenerate it from the actual Railway service after provisioning/configuration. Server configuration is defined in `apps/web/src/env.server.ts`; the database package receives its validated connection URL.

## Tests

Install PostgreSQL tools (`initdb`, `pg_ctl`, `createdb`) and run:

```sh
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
```

Each command creates an isolated loopback-only PostgreSQL cluster and database, applies migrations, runs tests and removes the fixture. Browser tests build and start the production server on an available local port, seed signed Better Auth sessions in the fixture database, and exercise real HTTP routes. There is no production test-login endpoint. Google OAuth tests substitute only the external Google response while exercising Better Auth's real state, callbacks, cookies and admission transactions.

## First deployment and Google setup

See [operations](docs/operations.md) and [the proposed Railway plan](docs/railway-plan.md). Infrastructure application and live Google/provider verification are still pending. Provision the resources, generate a private Better Auth secret remotely, assign the web service a Railway HTTPS domain, and configure the Google OAuth web client before enabling sign-in.

## Using it

1. Sign in with the configured operator Google account, or follow an unused invitation.
2. Add source subscriptions by name and HTTP/HTTPS iCalendar URL. Query-token and private-path subscription links are supported; embedded username/password URLs are not.
3. Create a calendar, select its sources and add optional title prefixes. The same source can use different prefixes in different calendars.
4. Copy the calendar's URL and add it in your calendar app using its subscription-from-URL option. Subscribers need no Calendar Club account.

Anyone holding a subscription URL can read it. Editing a calendar keeps its URL stable. **Replace link** creates a new URL and invalidates the old one, so send the replacement to all subscribers. Deleting a calendar invalidates its URL. Disabling or removing a source stops including its events.

Source checks and subscriptions use one fetch/cache path. Successful data is cached for 15 minutes; failures retry after one minute. The dashboard reports the last observed attempt and success, not continuous monitoring. Good snapshots survive provider failures and app restarts. Partial outputs keep available events; if every active source has no usable data yet, the feed returns HTTP 503 with a retry hint. An intentionally empty calendar returns valid empty iCalendar data.

Prefixes affect titles only. Event identities stay stable within a source; separate sources remain distinct. Recurrence, exceptions, cancellations, time zones, all-day spans, descriptions, locations, links and nested alarms are retained where possible. Private subscription URLs and identifiable credentials are scrubbed from published event metadata. The preview is a sample of stored events; calendar clients expand recurring series and control refresh timing.
