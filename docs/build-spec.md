# Calendar aggregator build specification

Status: approved for implementation, 2026-10-06. This specification incorporates the decisions in [design-discussion.md](design-discussion.md) and replaces the pasted prompt as the build scope. Exact infrastructure-plan application remains a separate approval checkpoint.

## Outcome

Build an invite-only hobby service in which each account holder manages external calendar subscriptions and combines selected sources into independently configured, read-only iCalendar outputs. Subscribers receive a stable private URL and do not need an account. The existing editable calendar called ❤️ remains separate.

## Application and persistence

Use pnpm and Turborepo with exactly two initial packages:

- `apps/web`: TanStack Start, dashboard, Better Auth configuration, invitations, upstream fetching, aggregation, and feed routes.
- `packages/db`: PostgreSQL connection boundary, Drizzle schema, and migrations. Export TypeScript source initially where supported by consumers.

Keep auth and calendar logic in the app. Persist accounts and permissions, invitations, owner-scoped sources and outputs, source-to-output membership with optional prefixes, subscription secrets, fetch status, and last known good source data. Data must survive application restarts. The database package receives validated server configuration rather than importing browser-accessible application configuration.

Follow Vitalplus's environment approach: T3 Env validates exact server configuration, generated schemas contain variable names only, and local startup reads the explicitly selected Railway service's variables through the CLI into memory. Pass values to child processes without persisting dotenv files. Disable Vite/Nitro dotenv loading for that startup path. Do not generate global process.env types or expose server variables through client modules.

## Authentication and admission

- Google is the initial sign-in method. The dashboard requires an authenticated, admitted account, and every server operation rechecks permissions.
- Bootstrap Christian's operator account using an explicitly configured Google identity. Ordinary Google sign-in must not grant operator permission.
- Only the operator may create invitations. Every invitation belongs to its creator's account and authorizes one new account. It has no time-based expiry or intended-email binding.
- The invitation screen creates and copies URLs, lists creation and redemption status and the redeemed identity, and revokes unused invitations. The operator sends URLs manually.
- Opening an invitation or cancelling/failing Google sign-in leaves it usable. Successful admission consumes it. Used or revoked invitations cannot admit another account, including during simultaneous redemption attempts.
- Established accounts sign in without invitations. Signing in as an established account through an unused invitation does not consume it.
- Demonstrate concurrency-safe admission at the database boundary. Do not rely on a client-side check or on Better Auth's post-commit after hook alone. Any intermediate authentication state must not grant calendar access or spend an invitation without recoverable admission.
- Defer self-service account deletion and operator user-management screens. Document manual operator account cleanup.

## Source and output management

- Account holders can add, rename, edit, disable, and remove their own source subscriptions by name and URL.
- They can create, rename, and delete multiple outputs and choose whole-source membership independently for each output. One source may appear in several outputs.
- A title prefix belongs to a source's inclusion in a particular output. Changing a prefix or membership does not rotate the subscription URL.
- Show and copy an output's URL and support explicit rotation. Rotation invalidates the prior URL for all subscribers; users receive a clear explanation before choosing it.
- Provide a small output preview, source fetch status, last attempt, last successful fetch, and safe, useful errors. An output indicates when included sources are using older data or have no usable data.
- Keep the dashboard usable on desktop and iPhone. Preserve entered values after failed saves and provide retry behavior.
- Users can only manage and preview their own sources and outputs. Operator invitation permission does not add dashboard access to other users' calendars.

## Calendar behavior

- Serve one standards-compliant `.ics` format over HTTPS with an appropriate `text/calendar` content type.
- Possession of an unguessable output URL grants read access. Keep it stable until deliberate rotation; prevent indexing and redact subscription paths/tokens from application logging.
- Preserve original event properties wherever possible, including descriptions, locations, event links, all-day values, time zones, recurrence rules, exceptions, updates, and cancellations. Apply the configured title prefix without exposing upstream subscription URLs or credentials.
- Give each source's events stable identities across refreshes and event changes. Keep recurring masters and exceptions related. Namespace identity by persistent source identity where needed so different sources remain independent; changing a source URL does not itself change the source record's identity.
- Events from different sources remain distinct. Do not merge by title, time, or presumed real-world equivalence. Replace a source's successful snapshot rather than accumulating old revisions across refreshes.
- Fetch on demand using bounded caching shared by outputs that use the same source. Store last known good data durably. Dashboard checks reuse the fetch path; no separate health-monitoring service is required.
- On fetch or parse failure, retain last known good data, report stale status, and retry on subsequent eligible requests. A successful empty source is a valid snapshot, not a fetch failure. Deliberately disabling/removing a source stops its inclusion.
- If a selected source has never provided usable data, expose that condition clearly in the dashboard. If none of an output's selected active sources has usable data, return a retryable feed failure rather than a misleading successful empty calendar. A deliberately empty output can return a valid empty calendar.
- Use finite fetch deadlines, redirect limits, body-size limits, and bounded fetch concurrency. Select documented defaults during implementation and test that those bounds are enforced. Cache failures briefly so repeated subscriber requests do not hammer a broken upstream.
- Health reports the latest observed fetch result. Calendar clients control when they request an output, so source changes cannot promise an immediate update in subscribers' apps.

## Boundaries and conventions

- Treat source URLs and redirects as untrusted fetch targets. Restrict supported protocols and block private, loopback, link-local, metadata, and other non-public network destinations for IPv4 and IPv6. Validate DNS results and redirects, and prevent resolution changes from bypassing destination checks.
- Keep source credentials, invitation/subscription secrets, and private configuration out of Git, static client bundles, public calendar metadata, errors, and logs. Authenticated owners may access their own source settings and output URLs through authorized server responses.
- Validate inputs and startup configuration. Derive application types from schemas and registered query/mutation/server-function contracts. Keep server-only imports behind server boundaries.
- Follow the relevant readability, data-access, route, and cache conventions in the accessible Vitalplus and Kodiak reference documents. Preserve framework control-flow errors; never disguise a failed operation as a successful empty result.
- Keep the root `CONTEXT.md` strictly a glossary, add ADRs sparingly, and use no em dashes in UI or documentation.

## Delivery targets and verified starting state

Read-only inspection on 2026-10-06 found:

- [GitHub repository](https://github.com/christianalares/calendar-aggregator): accessible, public, empty, with no default branch. The local directory contains discussion documents but is not yet a Git repository.
- [Railway project](https://railway.com/project/7d5bf55e-3c2d-4df5-abe9-0f0aa36ad435): accessible, with a production environment and no services, volumes, buckets, shared variables, or staged changes.

Recheck before mutations. Preserve any intervening work or infrastructure. Initialize and publish the approved application to the intended GitHub repository, then fetch and compare exact local/remote refs before reporting synchronization.

Prepare `.railway/railway.ts` using the current TypeScript SDK for one app service and PostgreSQL. Review a redacted infrastructure plan before applying it. Exact plan application is a separate approval checkpoint; destructive changes, resource replacement, and credential rotation require specific authorization. Verify the deployed health route, authentication, and an actual `.ics` HTTP response, not only build/deployment status. See [Railway IaC](https://docs.railway.com/infrastructure-as-code).

## Verification and external inputs

Use the bounded slices and explicit test seams in [implementation-plan.md](implementation-plan.md). Validate feeds with realistic fixtures and an iCalendar parser, exercise the actual dashboard including a failed save and successful retry, and perform a real subscription check where an available client permits it. Report automated checks, browser checks, live provider checks, and subscriber checks separately.

External inputs can arrive later:

- Christian's Google sign-in email for operator bootstrap.
- Google OAuth client configuration and credentials for local/production callbacks. Configure secrets through protected local/server environment storage, not source files or chat transcripts.
- A few real source URLs for live provider verification. Treat token-bearing URLs as secrets.

Fixtures and controlled authentication/network seams support earlier work. Real Google authentication and live calendar-provider acceptance remain unverified until those inputs are configured.

## Deferred scope

Billing, public signup, request access, collaborative management, event filters, cross-source merging, editable events, upstream write-back, CalDAV serving, background monitoring/notifications, extra application packages, and account-management screens are outside the initial release. The combined-prefix merging idea remains recorded for later exploration.
