#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
set -a; source .env; set +a
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out=${BACKUP_DIR:-/var/backups/hashpass-ops}/$stamp
install -d -m 0700 "$out"/{plane,frappe,config}
trap 'rm -rf "$out"' ERR
# Consistent database dumps; secrets remain outside stdout/logs.
docker compose --env-file .env -f plane/compose.yaml exec -T plane-db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$out/plane/database.dump"
docker compose --env-file .env -f frappe/compose.yaml exec -T frappe-db \
  mariadb-dump -uroot -p"$FRAPPE_DB_ROOT_PASSWORD" --single-transaction --all-databases | gzip > "$out/frappe/database.sql.gz"
# Application files include Plane uploads plus Frappe public/private site data.
docker run --rm -v hashpass-plane_uploads:/source:ro -v "$out/plane:/backup" alpine:3.22 tar czf /backup/uploads.tar.gz -C /source .
docker run --rm -v hashpass-helpdesk_sites:/source:ro -v "$out/frappe:/backup" alpine:3.22 tar czf /backup/sites.tar.gz -C /source .
cp .env "$out/config/env"; chmod 0600 "$out/config/env"
cp compose.yaml "$out/config/edge-compose.yaml"
cp caddy/Caddyfile "$out/config/Caddyfile"
cp plane/compose.yaml "$out/config/plane-compose.yaml"
cp frappe/compose.yaml "$out/config/frappe-compose.yaml"
printf '%s  %s\n' "$(sha256sum "$out"/{plane/*,frappe/*,config/*} 2>/dev/null | sha256sum | cut -d' ' -f1)" "$stamp" > "$out/MANIFEST.sha256"
# Off-server copy is mandatory in production. restic encrypts content and applies retention.
backup_access_key=${BACKUP_S3_ACCESS_KEY_ID:-${AWS_ACCESS_KEY_ID:-}}
backup_secret_key=${BACKUP_S3_SECRET_ACCESS_KEY:-${AWS_SECRET_ACCESS_KEY:-}}
: "${backup_access_key:?Set BACKUP_S3_ACCESS_KEY_ID or the legacy AWS_ACCESS_KEY_ID}"
: "${backup_secret_key:?Set BACKUP_S3_SECRET_ACCESS_KEY or the legacy AWS_SECRET_ACCESS_KEY}"
if [[ -z "${BACKUP_S3_ACCESS_KEY_ID:-}" || -z "${BACKUP_S3_SECRET_ACCESS_KEY:-}" ]]; then
  echo "Deprecated legacy AWS backup credentials in use; migrate to BACKUP_S3_* before the next major upgrade." >&2
fi
export AWS_ACCESS_KEY_ID="$backup_access_key" AWS_SECRET_ACCESS_KEY="$backup_secret_key"
restic backup "$out" --tag hashpass-ops
restic forget --tag hashpass-ops --keep-daily "${BACKUP_RETENTION_DAYS:-14}" --keep-weekly 8 --keep-monthly 12 --prune
