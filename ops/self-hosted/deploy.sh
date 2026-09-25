#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
test -f .env || { echo "Copy .env.example to .env and replace every placeholder." >&2; exit 1; }
if grep -Eq 'YOUR_|example\.invalid' .env; then echo "Refusing deployment with placeholder values." >&2; exit 1; fi
docker network inspect hashpass-ops >/dev/null 2>&1 || docker network create hashpass-ops >/dev/null
docker compose --env-file .env -f frappe/compose.yaml config --quiet
docker compose --env-file .env -f plane/compose.yaml config --quiet
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env -f frappe/compose.yaml up -d
docker compose --env-file .env -f plane/compose.yaml up -d
docker compose --env-file .env -f compose.yaml up -d
