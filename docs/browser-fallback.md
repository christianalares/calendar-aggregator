# Browser fallback delivery

Verified 2026-10-08.

Source owners can enable Use browser fallback in the source add/edit dialog. Normal HTTP fetching runs first; an opted-in source can use the private browser service after normal fetching fails. Existing sources default to false. Saving the option invalidates that source's fetch freshness; Check can fetch immediately after saving.

The service currently enables ligaspel.se only. Additional providers require operator allowlist configuration and testing. Browser fetching requires HTTPS on the default port. It uses fresh Chrome profiles, a virtual display, and an automated click on Cloudflare's verification checkbox when present.

## Update behavior

Refreshes are on demand from feed requests, output previews, and source checks. Successful snapshots are cached for 15 minutes; failed attempts can retry after one minute on another request. The last successful snapshot survives provider failures. No background polling was added. Subscriber apps control when they request the CalPal subscription URL, so 15 minutes is the source-cache freshness period, not a promise of subscriber update latency.

## Initial deployment and verification

- Production browser service: browser-fetch-poc, deployment 32690f3c-645f-47f7-8ed4-da90d0e8f44d, observed SUCCESS.
- Production web: deployment 6d75ab17-d28f-4471-9ec8-3b1ac05cd298, observed SUCCESS. Pre-deploy applies the migration adding source.use_browser with false as its default.
- Production /api/health: HTTP 200.
- Live production web fetch using the new source-fetcher through the private browser API: valid calendar, 7 parsed events, 2975 input bytes. No source settings were modified by this live test.
- 68 unit/integration tests pass, including owner-scoped persistence, shared cache, retained snapshots on failure, browser lease duration, API authentication/concurrency, and pinned-public-DNS policy.
- 4 dashboard browser tests pass across desktop and iPhone, including checkbox save/edit persistence and failed-save recovery.
- Type checks, lint, production build, and diff whitespace checks pass.

BROWSER_FETCH_SECRET is stored only in Railway and shared with web through a variable reference. The browser service has no public domain or database credentials. See apps/browser-fetch/README.md for limits and the network policy.

## Infrastructure declaration

.railway/railway.ts describes the existing browser service, its apps/browser-fetch source on main, and web variable references. The source-connection plan has 0 additions, 2 changes, and 0 destructions: connect the existing service to GitHub and set /health as its health-check path. Both health paths are accepted. Initial validation used direct Railway CLI uploads. Release verification checks that both production services deploy the pushed main commit and that the live calendar fetch succeeds.
