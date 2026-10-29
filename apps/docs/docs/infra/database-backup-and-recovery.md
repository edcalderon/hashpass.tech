---
title: Database backup and recovery
---

# Database backup and recovery

**Status (2026-10-21):** 6-hour dumps, read-only backup roles and the freshness alarm are built. The workflows run once they reach `main`. Retention tiers, Object Lock, the cross-region replica and the pre-migration dump are built; the yearly disaster exercise is a manual procedure.

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

AWS access is OIDC-only: a writer role (`PutObject` on `prod/core/*`, `prod/pre-migration/*`, `dev/shared/*`)
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
4. **Retention tiers** (built). `db-backup.yml` tags each upload `tier=frequent|daily|monthly|dev`; the bucket's lifecycle
   rules expire them after 14 / 35 / 365 / 90 days. Objects **without** a tier tag (manual dumps, `prod/bsl-final/`,
   pre-migration dumps uploaded as `daily`) are never matched by a rule by default, except the pre-migration ones noted below.
   Glacier Instant Retrieval transition is at 90 days (it bills a 90-day minimum).
5. **Tamper and region-loss protection** (built).
   * Object Lock, GOVERNANCE mode, 14 days default retention on new dumps. A dump cannot be deleted or overwritten for 14 days
     without `s3:BypassGovernanceRetention`. Enabling Object Lock cannot be undone. Not COMPLIANCE mode, so a mistake stays fixable.
   * Cross-region replica `hashpass-db-backups-replica-<account>-us-west-2` (versioned, locked, encrypted, same tiers).
     Delete markers are not replicated, so a delete in the primary does not remove the replica copy. Only objects written after
     2026-10-21 replicate automatically.
   * **Not covered:** compromise of the AWS account itself. A cross-account copy needs a second account and is not built.
   * The freshness Lambda also alerts when the newest replicated `prod/core/` dump is older than 12 hours.
6. **Yearly full disaster exercise** (procedure below, manual). Not automated: it needs a fresh Supabase project.
7. **Dump before every production migration** (built). `pnpm run db:migrate` takes a verified `pg_dump` (postgres:17 container,
   `pg_restore -l` check) before applying the first pending migration to any production profile, and aborts the migration
   if the dump fails. Dumps land in `~/hashpass-backups/pre-migration/` (mode 0600) and, when `DB_BACKUP_BUCKET` is set and AWS
   credentials are available, in `prod/pre-migration/` tagged `daily` (a separate prefix, so the restore drill and freshness alarm only see scheduled dumps; the bucket-wide `daily` retention rule expires it at 35 days and replication copies it; the read-only role can fetch it). Local runs use the `hashpass` profile after a non-printing account check; CI uses OIDC. `--skip-backup` bypasses it with a warning.
8. **Migration-gated deployment CI.** The static development, tenant-site, and API/infrastructure deploy workflows run the supported migration runner before deploying. They use `core-development` on `develop` and `core-production` on `main`; a database advisory lock serializes overlapping deploy workflows. Configure IPv4-reachable **session-mode pooler** connection strings with migration privileges as repository secrets `SUPABASE_DB_URL_DEV` and `SUPABASE_DB_URL_PROD`. Session mode is required for the advisory lock; transaction-mode pooler URLs are not supported. Production additionally uses `DB_BACKUP_WRITER_ROLE_ARN`, `DB_BACKUP_BUCKET`, and `AWS_TARGET_ACCOUNT_ID` repository variables to upload its verified pre-migration dump through OIDC. Migration failure blocks the corresponding deployment.

### Build vs upgrade

If the event load or the cost of 6 hours of lost data becomes unacceptable, the answer is the paid
plan (platform daily backups, then the PITR add-on), not more custom tooling. The custom service above
is still worth keeping then as an independent copy outside Supabase.

## Yearly disaster exercise

Once a year (suggest January), with a stopwatch:

1. Create a new throwaway Supabase project. Do not touch production.
2. Pull the newest dump from the **replica** bucket (`us-west-2`) with the reader role, not the primary, so the replica path is proven too.
3. Follow "Restore (disaster)" below up to step 3 and record the elapsed time. That is the real recovery time.
4. Point a staging API at it and sign in with a test account.
5. Delete the throwaway project and write the date, elapsed time and anything that broke into this page.

Last exercise: none yet.

## Restore (disaster)

1. Create a new Supabase project (same region). Note the new URL, keys and pooler URL.
2. Restore: `pg_restore --no-owner --no-privileges -d "<new direct url>" <dump>` using a `postgres:17`
   image. Expect non-fatal errors for Supabase-owned roles/extensions (`authenticated`, `supabase_vault`).
3. Verify with `packages/tools/scripts/db-backup/row-counts.sql` against the expected counts stored next to the dump.
4. Re-apply any migrations newer than the dump (`pnpm run db:migrate -- --profile core-production --dry-run` first).
5. Repoint production: `SUPABASE_DB_URL_PROD`, `DATABASE_URL`, `BETTER_AUTH_DATABASE_URL`, the Supabase URL/keys
   in the Lambda and repo variables, then rebuild the static sites (keys are baked into the bundles).
6. Users must re-authenticate if the JWT secret changed.
