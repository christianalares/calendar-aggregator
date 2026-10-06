# Single application with durable PostgreSQL storage

Even as a hobby service, the aggregator needs durable accounts, invitations, calendar configuration, and last known good source data. Use a TanStack Start application with PostgreSQL, Drizzle, and integrated Better Auth, following the familiar stack in the reference projects. One application serves account management and subscription feeds, organized as `apps/web` and `packages/db` in a small pnpm/Turborepo workspace to match the user's tooling preference.
