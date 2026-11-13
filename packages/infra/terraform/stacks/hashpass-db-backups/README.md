# hashpass-db-backups

Private S3 bucket for database dumps (`hashpass-db-backups-<account>-us-east-2`,
`hashpass` AWS profile). Dumps contain user data. Terraform state for this stack
is local and git-ignored; do not store it in this bucket.

| Prefix | Source | Notes |
|--------|--------|-------|
| `prod/core/` | core production `fxgftanraszjjyeidvia` | The only production database. |
| `prod/pre-migration/` | core production | Verified snapshots taken by the migration runner before pending production migrations. |
| `prod/bsl-final/` | BSL production `mnnqryrdlhddorqsrtbn` | Final dump, frozen at the 2026-10-21 consolidation. Not a restore source for current production. |
| `dev/shared/` | shared dev `gsugeqozyeokncpbndna` | |

Controls: all public access blocked, SSE-S3, versioning on, TLS-only policy,
`prevent_destroy`, `BucketOwnerEnforced`. Dumps move to Glacier Instant
Retrieval after 30 days (still immediately readable); overwritten versions are
removed after 90 days. Current objects never expire automatically.

## Taking and verifying a dump

Use the `postgres:17` image: the local `pg_dump` is v16 and cannot dump Supabase's
Postgres 17.

```bash
set -a; source .env; set +a
test "$(aws sts get-caller-identity --profile hashpass --query Account --output text)" = "$AWS_TARGET_ACCOUNT_ID"
D="$HOME/hashpass-backups"; mkdir -m 700 -p "$D"; TS=$(date -u +%Y%m%dT%H%M%SZ)
docker run --rm -e DBURL="$SUPABASE_DB_URL_PROD" -v "$D:/out" postgres:17 \
  sh -c "pg_dump \"\$DBURL\" -Fc --no-owner --no-privileges -f /out/core-prod_$TS.dump"
aws s3api put-object --profile hashpass --bucket "$(terraform output -raw bucket_name)" \
  --key "prod/core/core-prod_$TS.dump" --body "$D/core-prod_$TS.dump" \
  --server-side-encryption AES256 --checksum-algorithm SHA256
```

A dump is not verified until it has been restored: restore it into a throwaway
`postgres:17` container and compare row counts with the source. Expect harmless
errors for Supabase-only roles/extensions (`authenticated`, `supabase_vault`).
Compare the S3 `ChecksumSHA256` with the local file before deleting the local copy.

## Scheduled backups and restore drill

The change-aware workflow and writer policy described below are being prepared on
`develop`. Production continues to upload a full dump each run until the workflow
is released and this Terraform stack is applied. If the new workflow reaches
production first, missing read/list permissions make it fall back to a full dump.

| Workflow | Schedule | What it does |
|----------|----------|--------------|
| `.github/workflows/db-backup.yml` | core production every 3 hours (:30 past 00/03/06/…/21 UTC); shared dev Sundays 06:45 UTC | Counts public rows and makes a full `pg_dump` (postgres:17). Daily/monthly retention runs always keep a full restore point; other runs upload for a content change or seven-day refresh and record small unchanged markers between full dumps. |
| `.github/workflows/db-restore-drill.yml` | quarterly (Jan/Apr/Jul/Oct, day 5) | Restores the newest dump into a throwaway postgres:17 and compares every public table's row count with the counts captured at backup time |

AWS access is OIDC only. Both roles retain the repository's `main` branch
subject for scheduled backups and restore drills. The writer additionally
accepts the `production` environment subject used by migration jobs, which
upload pre-migration backups before applying production migrations:

* `hashpass-db-backups-writer`: writes dumps and state under `prod/core/*`, `prod/pre-migration/*`, and `dev/shared/*`; reads only the two `_state/latest.json` objects; lists object metadata under the scheduled backup prefixes. It cannot read dump bodies.
* `hashpass-db-backups-reader`: `GetObject`/`ListBucket` under the current core, pre-migration, and shared-dev prefixes.

Neither role can touch `prod/bsl-final/`, delete, or change the bucket.

Repository configuration (names only):

* variables `DB_BACKUP_BUCKET`, `DB_BACKUP_WRITER_ROLE_ARN`, `DB_BACKUP_READER_ROLE_ARN`
* secrets `DB_BACKUP_CORE_DB_URL` (core production pooler URL) and `DB_BACKUP_DEV_DB_URL`
  (shared dev pooler URL). Use a pooler URL: GitHub runners have no IPv6. A dedicated
  read-only database role is better than the owner credentials.

## Retention, lock and replica

* `db-backup.yml` tags full dumps with `tier=frequent|daily|monthly|dev` (14 / 35 / 365 / 90 days). Daily and monthly runs keep full dumps even when unchanged, preserving the 35-day and 365-day restore points. State and unchanged-marker objects use `frequent` (14 days). Untagged objects never expire.
* Object Lock GOVERNANCE, 14 days, on both buckets. Irreversible once enabled.
* Replica: `hashpass-db-backups-replica-<account>-us-west-2`, versioned, locked, encrypted, no delete-marker replication.
  Same account, so it does not protect against account compromise.
* `pnpm run db:migrate` dumps production first (`packages/tools/scripts/db-backup/pre-migration-dump.mjs`). The production CI deploy jobs use the writer OIDC role to copy that verified dump to `prod/pre-migration/`; it remains outside the scheduled-backup freshness and restore-drill prefixes.
* The writer permission for `prod/pre-migration/*` is Terraform-managed. Apply this stack's policy update before running a production migration; CI blocks that deployment if the verified dump cannot be persisted in S3.

## Freshness alarm

A Lambda (`hashpass-db-backups-freshness`, every 2 hours, no GitHub dependency) lists full dumps
and unchanged markers under `prod/core/` and `dev/shared/`. It counts a marker as fresh only when it
references the newest existing dump and that dump is at least 100 kB. It emails the
`hashpass-db-backups-alerts` SNS topic when core's newest verified state is older than 8 hours, dev
is older than 200 hours, or a full dump is under 100 kB. A CloudWatch alarm on the Lambda's own
errors (missing data counts as a failure) covers the checker failing. The email names the full dump
and latest unchanged check when applicable, the age against the limit, why it matters, and the
`gh workflow run db-backup.yml` command that fixes it (message built in `lambda/freshness.py`, covered
by `lambda/test_freshness.py`: `python3 -B -m unittest test_freshness` from that directory).
It only has `s3:ListBucket`, so it cannot read dump or state contents. **The email subscription must be
confirmed once** from the message AWS sends to the alert address.

A second EventBridge rule (`hashpass-db-backups-freshness-digest`, 13:00 UTC daily) invokes the same Lambda with
`{"digest": true}`. When everything is healthy it emails "HASHPASS database backups OK", saying whether each
database has new data or was verified unchanged against the last full dump (so "nothing to back up" is an explicit,
positive message, not silence). If anything is wrong, the normal alert is sent instead. A replica alert for the same
stale dump as the primary is folded into the primary alert, so one incident is one email.

## Gaps

* Supabase is on the **free plan**: no platform backups, no PITR, no add-ons. These dumps are the
  only backups; the recovery point is the most recent full dump plus verified unchanged checks.
  A full dump is forced at least every seven days and retained by the lifecycle tier. See
  `apps/docs/docs/infra/database-backup-and-recovery.md` for limits and the hardening plan.
* Nothing replicates the bucket to another region.
* The dump is logical: it covers the `public` schema and the objects `pg_dump` can read
  as the pooler user, not Supabase Storage objects or `auth` internals owned by the platform.
