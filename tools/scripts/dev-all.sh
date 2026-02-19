#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  if [[ "${HASHPASS_KEEP_DIRECTUS_ON_EXIT:-false}" == "true" ]]; then
    echo "Keeping Directus running (HASHPASS_KEEP_DIRECTUS_ON_EXIT=true)."
    return 0
  fi

  echo "Stopping Directus..."
  pnpm --filter hashpass-directus run down >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

echo "Starting Directus (detached)..."
pnpm --filter hashpass-directus run up

echo "Starting web app..."
pnpm --filter hashpass-web-app run dev
