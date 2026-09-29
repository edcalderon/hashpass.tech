#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
test -f .env || { echo "Copy .env.example to .env and replace every placeholder." >&2; exit 1; }
if grep -Eq 'YOUR_|example\.invalid' .env; then echo "Refusing deployment with placeholder values." >&2; exit 1; fi
docker network inspect hashpass-ops >/dev/null 2>&1 || docker network create hashpass-ops >/dev/null
docker compose --env-file .env -f frappe/compose.yaml config --quiet
docker compose --env-file .env -f plane/compose.yaml config --quiet
docker compose --env-file .env -f mcp/compose.yaml config --quiet
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env -f frappe/compose.yaml up -d
# The Frappe nginx template resolves the backend service when it starts. A
# backend replacement can therefore leave an unchanged frontend pointing at a
# stale container address until nginx is recreated.
docker compose --env-file .env -f frappe/compose.yaml up -d \
  --no-deps --force-recreate --wait --wait-timeout 90 frappe-frontend
docker compose --env-file .env -f plane/compose.yaml up -d
docker compose --env-file .env -f mcp/compose.yaml up -d --build --wait --wait-timeout 180
docker compose --env-file .env -f compose.yaml up -d --wait --wait-timeout 60
docker compose --env-file .env -f compose.yaml exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file .env -f compose.yaml up -d --force-recreate --wait --wait-timeout 60 caddy
