# Consolidate the BSL production database into core

Decision (2026-10-20): core (`fxgftanraszjjyeidvia`, us-east-2) is the single
production database for every tenant and event. The BSL project
(`mnnqryrdlhddorqsrtbn`, us-west-2) becomes a read-only backup. See
`apps/docs/docs/infra/decisions/single-core-database.md` for the reasoning.

`db/migrations/V125__consolidate_bsl_prod_data_into_core.sql` copies the
BSL-only data. It is **not** part of any `database-profiles.json` group: it
needs the BSL snapshot staged first and is run by hand, once.

## Prerequisites

* Docker (`postgres:17` client; the local `pg_dump` is v16 and refuses v17
  servers).
* `SUPABASE_DB_URL_PROD` (core) and `BSL_SUPABASE_DB_URL_PROD` in `.env`.
  Pass them to containers through environment variables; never echo them.
* Core already migrated through V124 (`core-production` profile):

  ```bash
  node packages/tools/scripts/migrate-tenant-db.mjs --profile core-production --dry-run
  node packages/tools/scripts/migrate-tenant-db.mjs --profile core-production
  ```

## 1. Back up both databases

Keep dumps outside the repo (they contain user data) in a `chmod 700` directory.

```bash
mkdir -m 700 -p "$HOME/hashpass-backups" && cd "$HOME/hashpass-backups"
docker run --rm -e DBURL="$SUPABASE_DB_URL_PROD" -v "$PWD:/out" postgres:17 \
  sh -c 'pg_dump "$DBURL" -Fc --no-owner --no-privileges -f /out/core_pre_consolidation.dump'
docker run --rm -e DBURL="$BSL_SUPABASE_DB_URL_PROD" -v "$PWD:/out" postgres:17 \
  sh -c 'pg_dump "$DBURL" -Fc --no-owner --no-privileges -f /out/bsl_final_snapshot.dump'
```

Check both with `pg_restore -l <file> | wc -l` (non-trivial line count).

## 2. Stage the BSL data on core

Dump only the BSL `public` and `auth` data, rename the schemas, and restore into
core as `bsl_import` / `bsl_import_auth` (restore into a scratch Postgres first,
rename there with `ALTER SCHEMA ... RENAME TO`, dump again, restore into core).
The staging schemas are plain tables; V125 only reads them.

## 3. Rehearse, then run

1. Restore the **core** backup into a throwaway container, apply V063…V124 and
   the staged schemas, then run V125 with its `COMMIT` replaced by `ROLLBACK`.
2. When the rehearsal is clean, run V125 against core:

   ```bash
   docker run --rm -i -e DBURL="$SUPABASE_DB_URL_PROD" postgres:17 \
     sh -c 'psql "$DBURL" -v ON_ERROR_STOP=1' < db/migrations/V125__consolidate_bsl_prod_data_into_core.sql
   ```

V125 is a single transaction. Its final block raises (and so rolls everything
back) if a speaker, session, meeting request or agenda row from BSL is missing
on core. It reports, rather than fails on, passes it deliberately skipped.

## Expected counts (2026-10-20 snapshot)

| Item | Result |
|---|---|
| BSL-only auth users copied | 76 (13 shared emails resolve to the core account) |
| BSL-only `public.user` rows | 127 |
| Speakers | 111 (60 shared uuids updated, 51 colombia2026 inserted) |
| Passes not copied | 31 duplicate a core pass; 8 have no owner on either side |
| Better Auth `ba_users` | 294 BSL-only copied; 3 shared emails keep the core row |
| Meeting slots | 225 copied (224 remapped from `public.user` ids to auth ids) |

## 4. Verify

```sql
-- every BSL speaker is on core
SELECT count(*) FROM bsl_import.bsl_speakers b
 WHERE NOT EXISTS (SELECT 1 FROM public.bsl_speakers c WHERE c.id = b.id::text);   -- 0
-- nothing points at a missing account
SELECT count(*) FROM public.passes p
 WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id::text = p.user_id);       -- 0
SELECT count(*) FROM public.account a
 WHERE NOT EXISTS (SELECT 1 FROM public.ba_users u WHERE u.id = a."userId");       -- 0
-- booking works for a General-pass holder
SELECT * FROM public.can_make_meeting_request('<core auth id>', '<speaker uuid>', 0, 'colombia2026');
```

`meeting_requests` rows whose speaker no longer exists (2 on core, 3 from BSL)
were already dangling before the copy.

## 5. Cut over (separate step, after verification)

1. Point the production Lambda's `BETTER_AUTH_DATABASE_URL`, `DATABASE_URL` and
   `SUPABASE_DB_URL` at core with `packages/tools/scripts/deploy-api-lambda.sh`
   (it masks environment values; never print the Lambda configuration).
2. Route every BSL host and event to the `core-production` Supabase profile
   (`apps/mobile-app/lib/server/event-supabase-profile.ts`, `config/supabase-profiles.ts`).
3. Better Auth sessions were copied, so signed-in users stay signed in. Confirm
   with one real sign-in on `bsl.hashpass.tech` and on `hashpass.tech`.
4. Drop the staging schemas: `DROP SCHEMA bsl_import CASCADE; DROP SCHEMA bsl_import_auth CASCADE;`.

## Rollback

* Before the cutover: restore nothing; revert the Lambda env and the profile
  routing. The copy only added rows to core.
* After the cutover: BSL is frozen at the snapshot, so rows created on core
  since then would be lost by pointing back at BSL. Prefer a forward fix; if
  core itself is damaged, restore `core_pre_consolidation.dump` into a new
  project and swap the pooler URL.

## Retired

The `bsl-production` profile is no longer migrated. BSL keeps its data as a
backup and receives no further schema changes.

The staging schemas (`bsl_import`, `bsl_import_auth`) were dropped from core on
2026-10-21 after the cutover was verified.
