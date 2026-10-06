# Design discussion

## Dashboard design direction, 2026-10-06

The user subsequently approved implementing this layout in the working application. Calendar cards, source/invite tables, and consistent section actions are now migrated to shadcn Base UI.

- Keep calendars, sources, and operator-only invitations on one page. Use a responsive calendar card grid that accommodates eight calendars, with three, two, or one column according to available width.
- Give all three sections the same header pattern: title and count on the left, a primary create/add button on the right.
- Show sources and invitations as tables. Sources expose URL, status, last attempt, and last success directly. Put Check, Edit, and Delete inside each source's ellipsis actions menu.
- Use shadcn/ui for the production UI. The green visual direction is rejected. The first implemented theme uses cobalt primary actions, neutral surfaces, Nunito headings, and Nunito Sans body text. Small teal/amber/coral status accents add color without filling every card. Light, dark, and system appearance are available.
- The user subsequently selected the supplied dashboard/calendar reference colors for light and dark. The current palette uses a cool gray canvas, white cards, navy ink, vivid blue actions, and soft blue/cyan/peach/rose/violet/mint source labels. Dark mode carries the same hues on charcoal surfaces. Mint remains a supporting source/health color; blue is the brand color. Theme colors live together in `apps/web/src/theme.css` for quick iteration.
- Explore calendar Preview as a modal so it does not expand individual cards. The implemented preview has a read-only month grid, selected-day entries, and an all-entries view. It marks only start dates present in the bounded raw feed sample and explains that calendar apps expand recurring series. A full calendar editor and recurrence expansion remain outside this change.

### Required overlay architecture

The user requires the same package and folder structure as Vitalplus. Its backoffice app was inspected and uses `pushmodal` and `createPushModal` with separate registries:

- `apps/web/src/components/modals/index.tsx`: register named modal components and export `pushModal`, `popModal`, and `ModalProvider`. Create/edit forms and calendar previews belong in this directory.
- `apps/web/src/components/sheets/index.tsx`: register sheets with the shadcn `Sheet` wrapper and export `pushSheet`, `popSheet`, and `SheetProvider` when sheets are introduced.
- `apps/web/src/components/alerts/index.tsx`: register confirmations with the shadcn `AlertDialog` wrapper and export `pushAlert`, `popAlert`, and `AlertProvider`. Deleting sources/calendars, replacing subscription links, and revoking invitations use this pattern.
- Mount the providers in the application root. Open and close overlays through the registered functions rather than defining dialogs or managing their open state inline in pages or feature components.

The UI foundation is now installed using shadcn's Base UI primitives, with explicit Base UI adapters for `pushmodal`. Existing forms and previews use the modal registry, and destructive confirmations use the alert registry. The sheet registry is ready for future features. See [UI foundation](ui-foundation.md) for setup and usage. The grid/table redesign and first CalPal theme are now implemented in the application, including the login screen. The original visual references remain in the theme capture.

This document records agreements from the grill-with-docs discussion. It is not an approved implementation specification. The pasted build prompt is input to the discussion; its remaining requirements and technology suggestions have not been approved as a whole.

## Session status

The product and architecture grilling session is complete. The user answered all remaining product questions; the engineering details listed below belong in a later implementation plan. The user subsequently approved implementation and the bounded build specification. Implementation is underway; exact infrastructure-plan application remains a separate checkpoint.

## Agreed on 2026-10-06

- The initial release is invite-only, with independent accounts for invited people.
- This is a hobby service. Letting other people use it is part of the fun, not a commitment to build a commercial SaaS product.
- The initial release has no billing or paid plans. Future commercial possibilities remain open.
- Output calendars initially select whole source subscriptions and support optional title prefixes.
- Event-level filters are deferred. Possible future rules include title contains, starts with, ends with, and location matching; their behavior is not yet designed.
- An account holder manages their own sources and output calendars and may share an output with whoever they choose. Subscribers receive events and do not manage source selection or settings. Collaborative management is outside the initial scope.
- Only the service operator, initially Christian, may invite people to create accounts.
- Title prefixes are configured for each source's inclusion in an output calendar, allowing the same source to use different prefixes in different outputs.
- Account holders initially sign in with Google. Google OAuth application configuration will be needed; no configuration has been performed.
- The service operator creates unique invitation URLs and sends them manually. Each invitation admits one new account holder through Google sign-in and is then used up.
- Invitations have no time-based expiry and are not bound to an intended recipient's email. Whoever possesses an unused link may redeem it, including someone to whom it was forwarded.
- Invitations are associated with their creator's account from the beginning. Christian's account will be provisioned as the initial operator account and have an invitation list and controls to create invitations; ordinary accounts cannot create invitations.
- The invitation screen supports creation, copying a URL, seeing whether an invitation was used and by whom, and revoking unused invitations. Request access is deferred from the initial release.
- Possession of an output's unguessable subscription URL grants read access without a service account. URLs remain stable until deliberately rotated. Forwarding a URL grants the next recipient the same access; rotation requires existing subscribers to add the replacement URL.
- When a source fetch fails, retain and serve its last known good data until the source recovers or the owner deliberately disables/removes it. Source fetch status and the last successful fetch are visible in the dashboard. The user wants the dashboard to show whether sources are healthy.
- Choose the simplest refresh approach: request-driven fetching with bounded caching. Dashboard health reflects the latest observed fetch; background monitoring and notifications are deferred. A shared fetch path can serve feed requests and dashboard checks.
- Select TanStack Start, PostgreSQL, Drizzle, and Better Auth. Use a small pnpm/Turborepo workspace with `apps/web` for the dashboard, auth, invitations, calendar fetching, and feed routes, and `packages/db` for Drizzle schema, migrations, and the database client. Auth and calendar logic remain in the app initially.
- Events from different source subscriptions remain distinct, even if they describe the same real-world event. Preserve stable identity within each source across refreshes and event changes. Automatic cross-source merging is deferred.
- Preserve everything possible from the original event, including descriptions, locations, and ordinary event links, while keeping upstream subscription URLs and credentials private.
- Defer self-service account deletion and operator user-management screens. The initial release includes sign-in, calendar management, and operator invitation management; account cleanup is manual operator maintenance when needed.

## Future ideas, not initial scope

- Cross-source event merging could combine prefixes: source A has `Fotboll` with prefix `⚽`, source B has `Fotboll` with prefix `👟`, and a merged output could show `⚽👟 Fotboll`. Matching rules, conflict resolution, and merged identity have not been designed.

## Engineering details for a later implementation plan

- Concurrency-safe invitation redemption, failed/cancelled sign-in recovery, and existing-account sign-in behavior. An invitation admits a new account; these cases must preserve that agreed rule.
- Cache durations, request timeouts, size limits, and secure upstream fetching.
- Owner authorization and preventing exposure of upstream subscription credentials, consistent with independent accounts and private sharing.
- Correct standards handling of recurrence, exceptions, time zones, all-day events, updates, and cancellations.

The selected stack is a design decision. No application, database, or authentication setup has been implemented.

The user subsequently approved the [build specification](build-spec.md) and [implementation slices](implementation-plan.md), and requested implementation. The user also requires Vitalplus's T3 Env and Railway CLI environment-loading approach. Slice 1 is in progress; infrastructure plan application remains separately gated.

## Verified authentication facts

- Google sign-in needs an OAuth client and configured callback URLs. The service's invitation policy is enforced by the application. Better Auth documents server-side user-creation hooks and carrying validated invitation context through an OAuth flow: [Google setup](https://better-auth.com/docs/authentication/google), [OAuth context](https://better-auth.com/docs/concepts/oauth#passing-additional-data-through-oauth-flow).
- Google's testing audience controls do not enforce this service's invitation policy. Google documents an exemption from the testing user allowlist for basic identity scopes: [OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
- One-use redemption needs explicit concurrency and failure handling. Better Auth's database after hooks run after the transaction commits, so consuming an invitation in a user-creation after hook alone does not make invitation consumption atomic with registration: [Better Auth 1.5 release notes](https://better-auth.com/blog/1-5#after-hooks-now-run-post-transaction).

## Recorded decisions

- [Private subscription URLs grant read access](adr/0001-bearer-subscription-urls.md).
- [Single application with durable PostgreSQL storage](adr/0002-application-and-persistence.md).

## Verified calendar facts

- A successful fetch/parse can establish observed source health, not whether upstream information is current or a subscriber's calendar has refreshed. Subscription clients control polling; the format does not guarantee update timing. [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545), [RFC 7986 refresh interval](https://www.rfc-editor.org/rfc/rfc7986#section-5.7).
- Event UIDs are intended to be globally unique. Recurring exceptions share the series UID and use RECURRENCE-ID to identify an occurrence. Matching title and time alone does not establish identity. [UID](https://www.rfc-editor.org/rfc/rfc5545#section-3.8.4.7), [RECURRENCE-ID](https://www.rfc-editor.org/rfc/rfc5545#section-3.8.4.4).

## Verification recommendation

Serve one standards-compliant iCalendar (`.ics`) feed format. Client-specific formats or integrations are not initial scope. Validate generated files automatically; a subscription check in one available real calendar app is recommended verification, not a requirement to choose a target client during this discussion. Real subscription checks complement parser validation by exercising URL access and event display. Client-side refresh timing is outside the service's control.

## Stack assessment

The accessible Vitalplus and Kodiak references both use TanStack Start, Better Auth, Drizzle, and PostgreSQL. The selected stack is familiar. The chosen two-package layout follows the user's Turborepo preference while keeping one application; package separation comes from pnpm workspaces and Turbo adds task orchestration and caching. Better Auth documents a [PostgreSQL-capable Drizzle adapter](https://better-auth.com/docs/adapters/drizzle) and [TanStack Start integration](https://better-auth.com/docs/integrations/tanstack). See [Turborepo structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository).
