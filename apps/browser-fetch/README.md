# Calendar browser fallback

A private Railway service that uses Patchright 1.63.0 and Google Chrome with an Xvfb display. The web app calls authenticated POST /fetch only when a source's browser fallback setting is enabled and normal HTTP fetching fails. GET /health checks process availability.

BROWSER_FETCH_SECRET must contain at least 32 characters. Configure the same secret on web using a Railway variable reference. BROWSER_FETCH_URL points to this service's private HTTP address on port 3000. Do not expose a public domain.

BROWSER_FETCH_ALLOWED_HOSTS is a comma-separated operator allowlist, initially ligaspel.se. Other providers need explicit testing and configuration. Only HTTPS on the default port is supported. Every job validates DNS results, rejects non-public addresses, pins Chrome resolution to the validated public IPv4 addresses, and permits network requests only to the selected provider and challenges.cloudflare.com. Other resource hosts and cross-host redirects are blocked. Service workers and WebSockets are blocked.

Each fetch uses a fresh temporary browser profile. It looks for Cloudflare's verification checkbox within its challenge frame and clicks it when shown. No account credentials or clearance cookies are persisted. Calendar responses and downloads are supported. There is one active browser job per service instance; concurrent requests return 429. Jobs are terminated after 55 seconds, browser verification has a 45-second deadline, calendar output is limited to 5 MiB, and request bodies are limited to 8 KiB. Requests, subscription URLs, cookies, and browser diagnostics are not logged.

The database stores the source option and last successful calendar snapshot. Normal and browser fetching share the existing on-demand cache: 15 minutes after success, 1 minute after failure. Checks, previews, and subscription requests trigger eligible refreshes. Failed refreshes preserve last known good data. Browser-enabled sources have a 90-second database lease to prevent other app replicas from claiming an in-flight browser check after the shorter normal HTTP deadline.

Deployment uses Dockerfile. The existing browser-fetch-poc service is retained to preserve its Railway identity. Its source declaration is in .railway/railway.ts at the repository root. Review a generated Railway plan before applying source configuration.
