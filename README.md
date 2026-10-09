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

The local app runs at `http://localhost:3000`. Startup reads service variables using the Railway CLI, verifies project/environment/service metadata, generates `apps/web/src/env.generated.ts` from variable **names only**, and opens an authenticated SSH tunnel to the private PostgreSQL service. Values remain in memory and pass to the child process. No dotenv files are written or loaded. T3 Env validates the app's server configuration.

When using the existing Tailscale HTTPS proxy, select its origin at startup so OAuth callbacks and shared links use the same address as your browser:

```sh
CALENDAR_APP_URL=https://krilles-privat.tailce50d4.ts.net:3000 pnpm dev --environment production
```

Open the Tailscale address for that session. Register its Google callback alongside the localhost and production callbacks, as described in [operations](docs/operations.md).

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

The committed generated schema contains variable names from the configured Railway service. Regenerate it after configuration changes. Server configuration is defined in `apps/web/src/env.server.ts`; the database package receives its validated connection URL.

## Tests

Install PostgreSQL tools (`initdb`, `pg_ctl`, `createdb`) and run:

```sh
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
```

Each command creates an isolated loopback-only PostgreSQL cluster and database, applies migrations, runs tests and removes the fixture. Browser tests build and start the production server on an available local port, seed signed Better Auth sessions in the fixture database, and exercise real HTTP routes. There is no production test-login endpoint. Google OAuth tests substitute only the external Google response while exercising Better Auth's real state, callbacks, cookies and admission transactions.

## First deployment and Google setup

See [operations](docs/operations.md) and [the applied Railway plan](docs/railway-plan.md). The private database, web service, auth secret, HTTPS domain, operator identity and Google OAuth client are configured. Real Google operator sign-in through both the local Tailscale origin and production is verified. Deployment and acceptance evidence is recorded in [verification](docs/verification.md).

## Using it

1. Sign in with the configured operator Google account, or follow an unused invitation.
2. Add source subscriptions by name and HTTP/HTTPS iCalendar URL. Query-token and private-path subscription links are supported; embedded username/password URLs are not.
3. Create a calendar, select its sources and customize their title formatting and event filters. The same source can have different settings in different calendars.
4. Copy the calendar's URL and add it in your calendar app using its subscription-from-URL option. Subscribers need no Calendar Club account.

Anyone holding a subscription URL can read it. Editing a calendar keeps its URL stable. **Replace link** creates a new URL and invalidates the old one, so send the replacement to all subscribers. Deleting a calendar invalidates its URL. Disabling or removing a source stops including its events.

Source checks and subscriptions use one fetch/cache path. Successful data is cached for 15 minutes; failures retry after one minute. The dashboard reports the last observed attempt and success, not continuous monitoring. Good snapshots survive provider failures and app restarts. In a source’s edit dialog, **Use browser fallback** lets CalPal try a private browser connection when normal fetching fails. It uses the same refresh cache and last known good data. Browser checks can take up to a minute. Ligaspel is enabled initially; the operator can add other tested providers to the browser service’s allowlist. Partial outputs keep available events; if every active source has no usable data yet, the feed returns HTTP 503 with a retry hint. An intentionally empty calendar returns valid empty iCalendar data.

Open **Title formatting** on a dashboard calendar card. Text before or after the **Event title** chip adds a prefix or suffix. Expand **Rename rules** to compose a whole-title **Match** pattern and its **Show** replacement. Select text in an example title and choose **Capture selection** to make a reusable named chip; click that chip to choose any text, a single word or digits. Output chips can be repeated, reordered, or changed to upper/lowercase. The live preview uses the same formatting as the subscription feed, with examples from the source's cached events.

The first enabled matching rule wins, evaluated against the original title, then the prefix and suffix wrap its result. Matching ignores case unless **Match case** is checked; whitespace in fixed text matches one or more whitespace characters. Captures require nonempty text and end at the first following fixed text, or the title's end. Put fixed text between captures. Each source allows 20 rules with up to eight captures each; titles longer than 4,096 characters keep their original text while still receiving the prefix/suffix. Existing prefixes retain their previous spacing until edited in the composer. Apply the included database migration before running this version against an existing database.

Formatting affects titles only. Event identities stay stable within a source; separate sources remain distinct. Recurrence, exceptions, cancellations, time zones, all-day spans, descriptions, locations, links and nested alarms are retained where possible. Private subscription URLs and identifiable credentials are scrubbed from published event metadata. The preview is a sample of stored events; calendar clients expand recurring series and control refresh timing.

Open **Event filters** from a calendar card's actions menu, or expand **Filter out events** while creating or editing a calendar. Add up to 20 rules per source, matching its original title, description or location with **contains**, **equals**, **starts with** or **ends with**. Text is literal, including spaces and punctuation; matching ignores case unless **Match case** is checked. Any enabled matching rule excludes the event before title formatting. You can disable or delete rules later.

The exclusion preview updates as you edit and shows excluded titles, dates, matching reasons and counts before saving. It checks every entry in the last successful source snapshot, lists up to 40 excluded entries by start date, and notes unavailable, disabled or older source data. **Refresh preview** rereads the stored snapshot; use the source's **Check** action to fetch provider data through the normal cache policy. Cancelling leaves saved filters intact, and failed saves keep your edits for retry.

A match in any entry of a recurring series excludes the entire series and its exceptions. Counts represent feed entries rather than expanded recurring occurrences. Filters affect only this source's inclusion in this output; source snapshots and other outputs remain intact. An output with all events filtered out returns a valid empty feed. Apply migration `0003_funny_azazel.sql` before running this version against an existing database.
