# Schema snapshots — generated, not hand-written

These `.sql` files are `pg_dump --schema-only` output for each live Supabase
project's `public` schema. They are the **actual, current, ground-truth
schema** — as opposed to `db/migrations/`, which is what was *intended* to be
applied over time and has been shown to drift from reality more than once
(see `apps/docs/docs/infra/supabase-project-map.md`'s "Migration bootstrap
findings" section, and `apps/docs/docs/infra/DATABASE_SCHEMA.md` for the full
audit that introduced this directory).

| File | Project ref | What it is |
|---|---|---|
| `core-prod.sql` | `fxgftanraszjjyeidvia` | core production (`hashpass.tech`) |
| `bsl-prod.sql` | `mnnqryrdlhddorqsrtbn` | BSL production (`bsl.hashpass.tech`) |
| `dev.sql` | `gsugeqozyeokncpbndna` | shared dev — both `core-development` and `bsl-development` point here |

## Regenerating

```bash
npm run db:schema:dump              # all three
node packages/tools/scripts/dump-db-schemas.mjs --project core-prod   # just one
```

Requires Docker (`postgres:17-alpine` — Supabase runs Postgres 17, and this
repo's native `pg_dump` is v16, which cannot safely dump a newer server) and
the same `.env` DB URL variables the migration tooling already uses
(`SUPABASE_DB_URL_PROD`, `BSL_SUPABASE_DB_URL_PROD`, `SUPABASE_DB_URL_DEV`).

## When to regenerate

- Before cutting a release that includes new `db/migrations/V0xx__*.sql` files.
- Whenever you're about to reason about "what tables actually exist" for a
  cleanup, audit, or bug investigation — regenerate first, don't trust a
  possibly-stale snapshot.
- After applying any manual/ad-hoc DDL directly to a live project (which
  should be rare — see the governance note below — but has happened before).

## Reviewing changes

```bash
npm run db:schema:diff
```

A snapshot diff that shows schema changes NOT backed by a new file under
`db/migrations/` is a signal that someone ran ad-hoc DDL directly against a
live project again — exactly the failure mode this directory exists to make
visible. Treat that as a bug to fix (retroactively author the missing
migration file), not just a diff to accept.
