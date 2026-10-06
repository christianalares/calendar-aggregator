# Proposed implementation slices

Status: approved for implementation, 2026-10-06. These are bounded work items for [build-spec.md](build-spec.md), not published tracker issues. Slices 1 through 3 are implemented and locally verified. Slice 4 is in progress: the approved Railway plan is applied, deployment and HTTPS health are verified, real Railway-backed local startup is verified, and Google operator sign-in succeeds through Tailscale and production. Admission with a second real invited account, real providers and a calendar-client subscription remain pending. No project-specific tracker is configured; do not create a new board or publish issues without agreement.

Implement sequentially. Each slice has a concrete acceptance gate. Approval of this plan includes the test seams below; materially changing them requires another scope decision.

## 1. Workspace, persistence, and invite-only admission

Scope: pnpm/Turborepo, `apps/web`, `packages/db`, validated server configuration, Drizzle migrations, Google/Better Auth integration, configured operator bootstrap, invitation lifecycle, and protected dashboard shell. Prove invite admission and failure recovery before adding calendar features.

Acceptance:

- Builds and typechecks from the root; the browser bundle does not import database credentials or server-only modules.
- Database migrations run against an isolated PostgreSQL database and retain invitation/account state through an application restart.
- Non-admitted identities cannot use protected server functions. Only the operator can create/list/revoke invitations.
- Two simultaneous attempts to redeem one invitation admit at most one new account. Failed/cancelled sign-in and existing-account sign-in leave an unused invite usable. Used/revoked links fail safely.
- The operator can create, copy, inspect, and revoke an invitation in the dashboard. Protected browser navigation and direct server calls both enforce access.

Test seams: isolated real PostgreSQL transactions; a controlled Google identity/callback boundary; real authorization/admission functions and server routes; browser interaction with the invitation UI. A test-controlled identity never becomes a production auth bypass. Actual Google OAuth verification is a separate gate requiring configured credentials.

## 2. Owner-scoped source and output configuration

Scope: source CRUD/disable, output CRUD, source membership, per-membership prefixes, private subscription URLs and rotation, output preview shell, and responsive forms.

Acceptance:

- Two accounts cannot read or mutate each other's source settings or outputs, including with guessed IDs and direct server calls.
- Two outputs with overlapping source selections keep distinct URLs and memberships. Editing one does not change the other.
- Prefixes are independently configurable for the same source in different outputs.
- URLs survive renaming, membership changes, and restarts. Rotation invalidates only the selected output's old URL.
- Failed mutations preserve entered form values; retry can succeed without re-entry. Layout works at desktop and iPhone-sized viewports.

Test seams: two admitted identities against real owner-scoped data access and routes; persistent subscription-secret access; browser tests for an injected save failure followed by retry.

## 3. Secure upstream fetching, durable cache, and iCalendar outputs

Scope: fetch boundary, standards-aware parsing/serialization, stable source event identity, prefixes, durable snapshots, failure recovery, preview, and observed health status. Keep fetching request-driven.

Acceptance:

- Fixtures cover all-day events, named time zones, recurring masters, exceptions, moved instances, cancellations, changed titles, and valid empty calendars.
- Parser validation succeeds on generated outputs; recurring exceptions remain connected to their series. Identity remains stable across refresh/prefix/title/time changes.
- Similar events from two sources remain separate. Repeated refreshes and successful snapshot replacement do not accumulate stale revisions.
- Timeout, oversized body, invalid data, non-success response, and redirect failure retain good snapshots and expose safe status. Recovery uses the next successful snapshot. Persisted snapshots survive a restart.
- Cached requests reuse upstream results across outputs. Time, size, redirect, concurrency, and failure-retry bounds have behavioral tests using a controllable clock and network responses.
- The fetch path blocks forbidden protocols, private IPv4/IPv6 destinations, metadata endpoints, redirect escapes, and DNS resolution escapes. Tests exercise the production fetch policy, not an alternate permissive policy.
- Bearer URL access works without a login. Invalid/rotated tokens fail, partial source failures preserve available data, and total absence of usable data follows the specified feed failure policy.
- A successful empty source removes its prior events; a failed fetch does not. Preview and feed contents agree.
- Logs, output metadata, serialized errors, and static bundles do not expose known upstream subscription secrets.

Test seams: realistic ICS fixtures, an iCalendar parser, controlled network/DNS adapters and clock, isolated persistent snapshots, and actual HTTP feed routes. These seams substitute external conditions while exercising the production aggregation and access paths.

## 4. Publication, infrastructure plan, and live acceptance

Scope: operating documentation, Git publication, TypeScript Railway IaC, reviewed plan for the app/database resources, secret configuration, deployment, and live verification. Recheck remote state before acting.

Acceptance:

- Documentation explains local startup, source setup, subscribing, URL rotation, source failure/recovery, invitation handling, and manual account cleanup.
- Published commits preserve existing documents/work; fetched GitHub refs match the claimed local ref.
- Infrastructure plan targets the verified project/environment, contains only intended resources/changes, and preserves secrets. Present the concrete plan for approval before applying it.
- Observe successful application deployment, then independently verify HTTPS, health, dashboard protection, Google sign-in/admission, and a real calendar HTTP response.
- Use supplied real sources to check parsing, refresh/update behavior, and failures where controllable. A real calendar-client subscription check is recorded if available.
- Report each acceptance gate as verified, blocked, or unverified, with evidence. Credentials/source URLs missing at this stage do not become a claim of completed live acceptance.

Test seams: actual production HTTPS routes, configured Google OAuth, real supplied calendars, exact fetched Git refs, and the reviewed Railway plan/deployment identity. Fixture success cannot substitute for live verification.
