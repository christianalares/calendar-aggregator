# Operations

## Railway services

The registered project is `calendar-aggregator`, production. `.railway/targets.ts` pins the project/environment selectors. `.railway/railway.ts` declares one web service sourced from `christianalares/calendar-aggregator` on `main` and one private PostgreSQL service. The web service builds with `pnpm build`, migrates before deployment, starts the built Node server and checks `/api/health`.

Run `pnpm railway:plan` before every infrastructure application. Saved plans live in the ignored `.railway-plans` directory and may contain private configuration. Review the redacted diff and apply only the approved saved artifact with the same CLI version. A changed declaration or remote state invalidates it. Do not replace existing secrets or delete resources to make a plan pass.

After provisioning, create a Railway-generated HTTPS domain for `web`. Set variables on that service through Railway's protected settings:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Reference to the private PostgreSQL service, declared in IaC |
| `APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}`, declared in IaC; requires a generated domain |
| `BETTER_AUTH_SECRET` | A newly generated random secret, at least 32 characters |
| `OPERATOR_GOOGLE_EMAIL` | Christian's verified Google sign-in email |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth web client secret |
| `NODE_ENV` | `production`, declared in IaC |

Generate the auth secret once and retain it. Rotating it invalidates authentication cookies. The Google credential pair can be omitted while provisioning; sign-in then shows a setup notice. Configuring one without the other fails validation. Configure the operator identity before enabling Google sign-in.

Preserve remotely configured variables when reviewing future plans. Never place secrets, token-bearing source links or plan artifacts in Git. Regenerate the names-only server schema with `pnpm env:generate --environment production` after variable changes.

## Google OAuth web client

Create or select a Google Cloud project, configure its Google Auth Platform branding/audience, and create an OAuth client of type **Web application**. External audience is appropriate for friends with ordinary Google accounts. The app requests basic identity scopes only: `openid`, `email`, `profile`. It fetches calendar subscriptions separately and does not request Google Calendar API access.

Register these exact authorized redirect URIs:

- `http://localhost:3000/api/auth/callback/google`
- `https://krilles-privat.tailce50d4.ts.net:3000/api/auth/callback/google`
- The deployed HTTPS origin followed by `/api/auth/callback/google`

For local Tailscale access, start with `CALENDAR_APP_URL=https://krilles-privat.tailce50d4.ts.net:3000 pnpm dev --environment production` and use that address in the browser. The launcher permits only this origin and the normal localhost origin. The selected origin keeps OAuth state cookies and callback destinations on the same host; production continues to use Railway's configured HTTPS origin.

The production origin can be filled in after the Railway domain exists. Copy the client ID/secret into Railway's protected web-service variables. Do not paste the secret into a chat or source file. Set `OPERATOR_GOOGLE_EMAIL`, restart/redeploy the service, regenerate the environment schema, and complete a real sign-in before sharing invitations.

Google's testing status is separate from our invite policy. Google's current guidance makes basic-identity-only apps an exception to the testing user allowlist; admission here remains enforced by the application's transactional invitations. Workspace policies can still block an OAuth client. See [Google's OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server) and [app state guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), checked 2026-10-06.

## Invitation recovery

Only the operator can create/list/revoke invitations. Links have no expiry or email binding. Opening a link or cancelling Google sign-in does not spend it. Established accounts do not spend unused invitations. Admission locks the authentication identity and atomically claims the invitation and creates membership in one database transaction.

An authentication identity/session can temporarily exist without membership after a concurrent or failed admission. Every calendar and invitation operation requires persisted membership, so that state grants no dashboard access. The identity may retry sign-in with a usable invite. Used links never become usable again.

## Fetching and status

Each fetch has a 10-second deadline, 5 MiB body limit and at most three redirects. Public-address checks cover all DNS answers and each redirect, and the transport connects to a validated IP while retaining the original HTTP host and TLS identity. Unsupported protocols, embedded URL credentials and non-public destinations are rejected.

Fetch concurrency is four per application process. A database lease prevents simultaneous refreshes of the same source across requests/instances; expired leases recover after 15 seconds. A source version prevents in-flight responses overwriting edited configuration. Successful snapshots stay fresh for 15 minutes; failures are cached for one minute. Checks respect those same bounds.

Snapshots are replaced on success, including valid empty calendars. Failed fetches/parses keep the prior snapshot. Disabling/removing a source stops publication. Preview fetches refresh dashboard status. Unknown custom time zones without definitions retain their source representation; previews show wall time when no offset can be determined.

## Private data and logs

The app sends no application access logs containing subscription paths. Feed handlers use generic errors and do not log tokens or provider URLs. Framework errors at private database boundaries are replaced with safe messages. Dynamic responses use `no-store`, `no-referrer` and `noindex`; authenticated owners may see their own source settings and private URLs.

Railway/platform network request logs are controlled outside the application. Treat access to those logs as private because platform tooling can record requested paths. Do not copy raw request paths or token-bearing provider errors into public reports. Event descriptions and ordinary organizer/attendee details remain part of shared calendars, as intended by the preservation policy.

## Manual account cleanup

Use an authenticated private database connection. Take a backup and verify the exact account ID before maintenance. In one transaction:

1. Revoke/delete invitations created by that account. The creator reference intentionally prevents accidental deletion while those rows remain.
2. Set `used_by` to NULL on invitations redeemed by the account, retaining `used_at` so used links remain spent.
3. Delete the matching `auth_user` row. Sessions/accounts, membership, owned sources, outputs and their memberships cascade.

Do not remove only membership as a way to reset invitation consumption, and never clear `used_at` to reuse a link. The deployed operator should provision a replacement operator deliberately before removing their own identity. Self-service account administration remains outside initial scope.

## Release acceptance

A build or Railway deployment status alone is insufficient. Check:

- Successful deployment identity and HTTPS `/api/health` returning 200.
- Anonymous dashboard navigation redirects and direct private operations fail.
- Real Google operator sign-in, invitation admission, cancellation and existing-user login.
- Real source parsing/status and an anonymous `.ics` response with correct headers.
- Subscription in an available calendar client, recording the client and observed recurrence/time zone behavior.

See [verification](verification.md) for the distinction between automated fixtures and pending live acceptance.
