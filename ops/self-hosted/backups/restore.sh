#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd); cd "$ROOT"
backup=${1:?usage: restore.sh /absolute/path/to/backup}
test -f "$backup/plane/database.dump" && test -f "$backup/frappe/database.sql.gz"
read -r -p "This replaces both databases and file volumes. Type RESTORE: " answer
test "$answer" = RESTORE || exit 2
set -a; source .env; set +a
docker compose --env-file .env -f compose.yaml down
docker compose --env-file .env -f plane/compose.yaml stop api worker beat-worker live web admin space
docker compose --env-file .env -f frappe/compose.yaml stop frappe-backend frappe-frontend frappe-worker-short frappe-worker-long frappe-scheduler frappe-websocket
docker compose --env-file .env -f plane/compose.yaml exec -T plane-db dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"
docker compose --env-file .env -f plane/compose.yaml exec -T plane-db createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose --env-file .env -f plane/compose.yaml exec -T plane-db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "$backup/plane/database.dump"
gunzip -c "$backup/frappe/database.sql.gz" | docker compose --env-file .env -f frappe/compose.yaml exec -T frappe-db mariadb -uroot -p"$FRAPPE_DB_ROOT_PASSWORD"
docker run --rm -v hashpass-plane_uploads:/target -v "$backup/plane:/backup:ro" alpine:3.22 sh -c 'rm -rf /target/* && tar xzf /backup/uploads.tar.gz -C /target'
docker run --rm -v hashpass-helpdesk_sites:/target -v "$backup/frappe:/backup:ro" alpine:3.22 sh -c 'rm -rf /target/* && tar xzf /backup/sites.tar.gz -C /target'
./deploy.sh
