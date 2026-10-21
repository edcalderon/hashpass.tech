---
title: Database backup and recovery
---

# Database backup and recovery

**Status:** automated dumps built 2026-10-21 (workflows land on `main` with the next release); hardening items below are proposed, not built.

## Constraint: Supabase free tier

Core production (`fxgftanraszjjyeidvia`), shared dev (`gsugeqozyeokncpbndna`) and the
retired BSL project are on the **free plan**. That plan has no add-ons, so:

* No platform daily backups and **no point-in-time recovery (PITR)**. Nobody can
  "enable" them in the dashboard without upgrading the plan.
* No read replicas.
* No access to WAL archiving (`archive_command`), so pgBackRest/WAL-G-style
  continuous archiving is not possible on a managed project.

Consequence: **the only backups that exist are the ones we take ourselves**, as logical
dumps (`pg_dump`). Recovery point is the age of the newest dump, not "any second".
Treat the S3 bucket as the first line of defence, not the second.

## What exists

| Piece | Where |
|-------|-------|
| Bucket (private, encrypted, versioned, TLS-only, `prevent_destroy`) | `packages/infra/terraform/stacks/hashpass-db-backups` |
| Dump workflow (core daily, shared dev weekly) | `.github/workflows/db-backup.yml` |
| Quarterly restore drill (restore into throwaway `postgres:17`, compare row counts) | `.github/workflows/db-restore-drill.yml` |
| Row-count helpers | `packages/tools/scripts/db-backup/` |
| Final BSL archive and the one-off 2026-10-21 dumps | `prod/bsl-final/`, `prod/core/`, `dev/shared/` |

AWS access is OIDC-only: a writer role (`PutObject` on `prod/core/*`, `dev/shared/*`)
and a reader role (read on the same prefixes), both trusted only from `main`.

## Known limits of the current design

* **RPO is up to 24 hours** (core) / 7 days (dev). Anything written after the last dump is lost in a disaster.
* **A silent failure is not detected.** GitHub emails on a failed run, but it does not tell us
  when the schedule never ran. GitHub disables scheduled workflows after 60 days without
  repository activity on some repos, and a deleted secret or role fails the same way.
* **The dump credential is the owner URL.** A leaked `DB_BACKUP_CORE_DB_URL` is full write access to production.
* **Logical dump scope:** tables and data reachable through `pg_dump`. Not covered: project settings,
  Auth provider config, Edge Function code, Storage objects (speaker images live in our own S3
  buckets, not Supabase Storage). Schema and policies are reproducible from `db/migrations/`.
* **Free projects pause after about a week of inactivity.** Production is active; dev may pause and its dump will fail until restored.
* Single account, single region (us-east-2).

## Recommended service (best option on the free tier)

Keep it small and owned by us. Do not build WAL tooling that the platform will not let us run.

1. **Dump more often.** The database is a few MB, so a dump every 6 hours (RPO 6h) costs effectively nothing. Public-repo Actions minutes are free.
2. **Read-only backup role.** `create role backup_reader login password …; grant pg_read_all_data to backup_reader;`
   and use it for `DB_BACKUP_*_DB_URL`. A leaked backup secret then cannot modify data.
3. **Independent freshness alarm.** A scheduled AWS Lambda (EventBridge) that reads the newest key under
   `prod/core/` and publishes to SNS/email when it is older than 8 hours or the dump is below an
   expected size. It does not depend on GitHub, so it also catches a dead schedule.
4. **Retention (grandfather-father-son).** Keep every dump for 14 days, one per day for 35 days, one per
   month for 12 months, via a lifecycle rule on a `daily/` prefix plus a monthly copy. Current objects
   are never expired today; that is fine at this size but should be decided deliberately.
5. **Tamper and account-loss protection.** S3 Object Lock (governance mode) on the dump prefixes, and a
   cross-region (or cross-account) replica of the bucket. The writer role already cannot delete.
6. **Quarterly drill stays**, and add a yearly full disaster exercise: restore into a *new* Supabase
   project, apply nothing else, repoint a staging Lambda, and time it. That number is the real RTO.
7. **Pre-change snapshot.** `pnpm run db:migrate` against production should take a dump first when it
   applies any pending migration (cheap insurance for the riskiest operation).

### Build vs upgrade

If the event load or the cost of 6 hours of lost data becomes unacceptable, the answer is the paid
plan (platform daily backups, then the PITR add-on), not more custom tooling. The custom service above
is still worth keeping then as an independent copy outside Supabase.

## Restore (disaster)

1. Create a new Supabase project (same region). Note the new URL, keys and pooler URL.
2. Restore: `pg_restore --no-owner --no-privileges -d "<new direct url>" <dump>` using a `postgres:17`
   image. Expect non-fatal errors for Supabase-owned roles/extensions (`authenticated`, `supabase_vault`).
3. Verify with `packages/tools/scripts/db-backup/row-counts.sql` against the expected counts stored next to the dump.
4. Re-apply any migrations newer than the dump (`pnpm run db:migrate -- --profile core-production --dry-run` first).
5. Repoint production: `SUPABASE_DB_URL_PROD`, `DATABASE_URL`, `BETTER_AUTH_DATABASE_URL`, the Supabase URL/keys
   in the Lambda and repo variables, then rebuild the static sites (keys are baked into the bundles).
6. Users must re-authenticate if the JWT secret changed.
