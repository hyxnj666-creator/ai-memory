# internal-tools

Internal tooling repository. Conventions and decisions are documented in
[AGENTS.md](./AGENTS.md). Read that first.

## Layout

| Path | Purpose |
|---|---|
| `auth/` | Auth client for the customer portal SPA (in-progress). |
| `legacy-portal/` | Older portal, scheduled for migration. |
| `mobile-app/` | Companion mobile app (greenfield, not started). |
| `schema.graphql` | Public GraphQL API surface. |
| `migrations/` | Postgres schema migrations. |
