# hashpass-db-backups

Private S3 bucket for database dumps (`hashpass-db-backups-<account>-us-east-2`,
`hashpass` AWS profile). Dumps contain user data. Terraform state for this stack
is local and git-ignored; do not store it in this bucket.

| Prefix | Source | Notes |
|--------|--------|-------|
| `prod/core/` | core production `fxgftanraszjjyeidvia` | The only production database. |
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

| Workflow | Schedule | What it does |
|----------|----------|--------------|
| `.github/workflows/db-backup.yml` | core production daily 06:30 UTC; shared dev Sundays 06:45 UTC | `pg_dump` (postgres:17) + per-table row counts, size/`pg_restore -l` sanity checks, upload to `prod/core/` or `dev/shared/` |
| `.github/workflows/db-restore-drill.yml` | quarterly (Jan/Apr/Jul/Oct, day 5) | Restores the newest dump into a throwaway postgres:17 and compares every public table's row count with the counts captured at backup time |

AWS access is OIDC only, restricted to this repository's `main` branch:

* `hashpass-db-backups-writer`: `PutObject` under `prod/core/*` and `dev/shared/*` only.
* `hashpass-db-backups-reader`: `GetObject`/`ListBucket` on the same prefixes only.

Neither role can touch `prod/bsl-final/`, delete, or change the bucket.

Repository configuration (names only):

* variables `DB_BACKUP_BUCKET`, `DB_BACKUP_WRITER_ROLE_ARN`, `DB_BACKUP_READER_ROLE_ARN`
* secrets `DB_BACKUP_CORE_DB_URL` (core production pooler URL) and `DB_BACKUP_DEV_DB_URL`
  (shared dev pooler URL). Use a pooler URL: GitHub runners have no IPv6. A dedicated
  read-only database role is better than the owner credentials.

## Gaps

* Core still needs Supabase's own backups: enable daily backups and the PITR add-on
  (Dashboard > Database > Backups). The dump above is the second line, not the first.
* Nothing replicates the bucket to another region.
* The dump is logical: it covers the `public` schema and the objects `pg_dump` can read
  as the pooler user, not Supabase Storage objects or `auth` internals owned by the platform.
