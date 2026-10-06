# Railway provisioning plan

Status: approved and applied on 2026-10-06 with Railway CLI 5.62.1. The CLI confirmed `Applied pinned Railway configuration.`

Target: the existing `calendar-aggregator` project, `production`. Read-back found no services, volumes, buckets, shared variables or staged changes.

```text
Plan: 2 to add, 0 to change, 0 to destroy
  + Create database postgres
  + Create service web
```

`postgres` uses Railway's PostgreSQL 18 template and its persistent data mount at `/var/lib/postgresql/data`. Its configured endpoint is private; no public TCP proxy is requested.

`web` uses `christianalares/calendar-aggregator`, branch `main`, from the repository root. It builds with `pnpm build`, applies Drizzle migrations before deployment, starts the built app and checks `/api/health`. It receives the database URL by reference, production mode and an app URL referencing the generated Railway HTTPS domain.

The saved artifact is `.railway-plans/production.json`, ignored by Git. Its change-set hash is `sha256:fd1b7230d74bfbf0039a4fccd0575c5f62cfe6d5fcfd9d46ae0d1e970d53adbe`. It contains no destructive actions or diagnostics. Do not replace the artifact with a new evaluation after approval without checking for changed intent.

Applying the plan provisions the resources and triggers deployment. Initial application startup requires a generated HTTPS domain and a private `BETTER_AUTH_SECRET` configured remotely. Google credentials and the operator email enable sign-in afterward. Domain creation, remote initial secret configuration and redeployment complete that setup; no existing credentials are rotated.

The approved saved artifact created both services and the PostgreSQL data volume. The database is running privately with no public TCP proxy. The web service has a generated HTTPS domain and a remotely generated auth secret. The operator email and Google credential pair are configured; real operator sign-in is verified through Tailscale and production.

The maintained declaration now uses `preserve()` for the auth secret, operator identity and Google credential pair. PostgreSQL uses its template's default private endpoint, which the local launcher verified as `postgres.railway.internal`. The follow-up plan confirmed the configuration is up to date, with no pending resource changes. The original creation artifact records the approved historical change and must not be reapplied.

Live health, Google sign-in, real sources and a calendar-client subscription are tracked in [verification](verification.md).
