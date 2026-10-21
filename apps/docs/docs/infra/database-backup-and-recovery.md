---
title: Database backup and recovery
---

# Database backup and recovery

**Status (2026-10-21):** 6-hour dumps, read-only backup roles and the freshness alarm are built. The workflows run once they reach `main`. Items 4-7 under "Recommended service" are not built yet.

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
| Dump workflow (core every 6 hours, shared dev weekly) | `.github/workflows/db-backup.yml` |
| Quarterly restore drill (restore into throwaway `postgres:17`, compare row counts) | `.github/workflows/db-restore-drill.yml` |
| Freshness alarm (Lambda + SNS + CloudWatch, independent of GitHub) | same Terraform stack, `lambda/freshness.py` |
| Row-count helpers | `packages/tools/scripts/db-backup/` |
| Final BSL archive and the one-off 2026-10-21 dumps | `prod/bsl-final/`, `prod/core/`, `dev/shared/` |

AWS access is OIDC-only: a writer role (`PutObject` on `prod/core/*`, `dev/shared/*`)
and a reader role (read on the same prefixes), both trusted only from `main`.

## Known limits of the current design

* **RPO is up to 6 hours** (core) / 7 days (dev). Anything written after the last dump is lost in a disaster.
* **Silent failure is covered only once the alert email is confirmed.** The freshness Lambda emails when the newest
  dump is too old or too small, which also catches a schedule that never ran. The SNS subscription is created
  `PendingConfirmation` and does nothing until the recipient confirms it.
* **The dump credential is a read-only role** (`backup_reader`, `pg_read_all_data`, no write privileges, verified on
  core and dev). Its password lives only in the `DB_BACKUP_*_DB_URL` secrets; rotate it with `alter role backup_reader password '…'`.
* **Logical dump scope:** tables and data reachable through `pg_dump`. Not covered: project settings,
  Auth provider config, Edge Function code, Storage objects (speaker images live in our own S3
  buckets, not Supabase Storage). Schema and policies are reproducible from `db/migrations/`.
* **Free projects pause after about a week of inactivity.** Production is active; dev may pause and its dump will fail until restored.
* Single account, single region (us-east-2).

## Recommended service (best option on the free tier)

Keep it small and owned by us. Do not build WAL tooling that the platform will not let us run.

1. **Dump more often** (built). Every 6 hours for core; the database is a few MB.
2. **Read-only backup role** (built). `backup_reader` with `pg_read_all_data`, `bypassrls`, read-only by default, used by `DB_BACKUP_*_DB_URL`.
3. **Independent freshness alarm** (built). EventBridge-scheduled Lambda that checks the age and size of the newest dump and emails through SNS.
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
