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

## Gaps

* No schedule yet: dumps are manual. Core still needs point-in-time recovery or
  daily backups enabled in Supabase; this bucket is the second line, not the first.
* Nothing replicates the bucket to another region.
