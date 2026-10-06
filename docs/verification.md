# Verification

Local verification on 2026-10-06:

| Gate | Result and evidence |
| --- | --- |
| Production build | Passed with Vite 8 and the pinned Nitro adapter. The built Node server was exercised by browser tests. |
| Type safety | Root `pnpm check-types` passed for app, database, scripts, IaC and tests. |
| Formatting/lint | `pnpm lint` passed. Generated files are excluded. |
| Automated behavior | `pnpm test`: 45 tests passed against a freshly migrated isolated PostgreSQL database and controlled network/provider fixtures. |
| Browser/HTTP | `pnpm test:browser`: desktop Chromium and iPhone-sized Chromium passed; actual protected server functions, mutation failure/retry, source/output creation, preview, invitation revocation, anonymous `.ics` delivery, link rotation, sign-out, CSRF rejection and unauthenticated and non-admitted private-operation rejection, and ordinary-member invitation rejection. |
| Visual inspection | Desktop and iPhone screenshots inspected. No horizontal overflow or browser JavaScript errors in the tested workflow. |
| Persistence | Independent connection/service instances reused invitations, tokens and good snapshots. Migrations and tests use PostgreSQL 18. |
| Calendar fidelity | Fixtures cover named/IANA/floating times, daylight-saving definitions, recurring masters, moved/cancelled exceptions, exclusions, all-day spans, alarms, rich metadata, revisions and valid empty sources. Generated feeds were reparsed with ICAL.js. |
| Fetch policy | Production policy tested for IPv4/IPv6 private/reserved addresses, mixed DNS answers, redirect escapes/limits, bounded DNS/body stalls, body limit, status errors and actual pinned HTTP transport. |
| Cache/recovery | Bounded concurrency, shared-source cache reuse, persisted stale-data recovery, empty-snapshot replacement, partial/total failure and in-flight edit protection tested. |
| Secret boundaries | Metadata redaction, names-only environment generation and safe configuration/operation errors tested. Static client artifacts checked for server/database imports and known fixture secrets. |
| GitHub | Published initial build `7099ad7a52a34c5de72cab06420d1260e73055a0`; fetched `origin/main` matched local HEAD. Subsequent documentation updates are verified again before handoff. |
| Railway plan | Approved saved plan applied: private PostgreSQL, persistent volume and GitHub-backed web service created. See [plan](railway-plan.md). |
| Live Railway startup | Deployment `f063bf55-524f-4fbf-8568-599fa436ca07` of commit `4cf0f66` reached SUCCESS; pre-deploy logs confirmed migrations completed. Generated HTTPS `/api/health` independently returned 200 with `status: ok`. Anonymous `/` redirected to `/login`, and the login page returned 200 with the Google setup notice. Auth secret, public domain and operator email configured remotely. |
| Live Google OAuth | Pending client credentials; operator identity configured. Fixture callback success is not live acceptance. |
| Railway-backed local startup | `pnpm dev --environment production` loaded real web-service variables, authenticated through the private PostgreSQL SSH tunnel and started Vite on port 4310. Local `/api/health` returned 200 with `status: ok`; anonymous `/` redirected to `/login`. |
| Real source providers | Pending supplied private subscription URLs. |
| Native calendar client | Pending an available client and a live subscription URL. Mobile browser emulation is not a native calendar-client check. |

Testing does not promise immediate subscriber refresh: calendar clients choose their request timing. Prefixes and sample previews are not cross-source event merging or recurrence expansion.
