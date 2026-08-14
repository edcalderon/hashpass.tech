# Database

This app doesn't own its own database schema. All HashPass database
migrations — including the ones this app's own Supabase client(s) depend on —
live in one place: [`db/`](../../../db) at the repo root.

Database is a shared domain — this app is one of several tenants/consumers
(core and BSL both run on the same schema), so migrations, schema snapshots,
and Flyway config are kept in one place rather than duplicated per app.

See [`db/README.md`](../../../db/README.md) for setup, migration naming
conventions, and how to run migrations against a given tenant database.
