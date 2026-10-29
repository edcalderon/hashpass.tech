#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${WP_ENV_FILE:-$ROOT_DIR/.env}"
PROJECT="${WP_PROJECT:-hashpass-content}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.example to .env and set local-only passwords." >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" -p "$PROJECT" -f "$ROOT_DIR/compose.yaml" up -d db wordpress
"$ROOT_DIR/scripts/wait-for-local.sh"
docker compose --env-file "$ENV_FILE" -p "$PROJECT" -f "$ROOT_DIR/compose.yaml" --profile tools run --rm setup

echo 'Open http://blog.localhost:8088 and http://news.localhost:8088; admin: http://blog.localhost:8088/wp-admin/'
