#!/usr/bin/env bash
set -euo pipefail

MOBILE_PID=""
CLUB_PID=""
DOCS_PID=""
declare -a RESERVED_PORTS=()
CLUB_PORT="${CLUB_PORT:-3000}"
DOCS_PORT="${DOCS_PORT:-3101}"
# Keep the Expo web app on 8081 so it stays out of the club app's 3000 slot.
MOBILE_PORT="${MOBILE_PORT:-8081}"

port_is_busy() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :${port} )" >/dev/null 2>&1
    return $?
  fi

  (exec 3<>"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
}

port_is_reserved() {
  local port="$1"
  local reserved_port

  for reserved_port in "${RESERVED_PORTS[@]}"; do
    if [[ "${reserved_port}" == "${port}" ]]; then
      return 0
    fi
  done

  return 1
}

claim_port() {
  local label="$1"
  local port="$2"
  local start_port="$2"
  local max_port=$((start_port + 50))

  while port_is_busy "${port}" || port_is_reserved "${port}"; do
    if (( port >= max_port )); then
      echo "No free port found for ${label} starting at ${start_port}." >&2
      return 1
    fi

    echo "Port ${port} is busy; ${label} will try $((port + 1))." >&2
    port=$((port + 1))
  done

  RESERVED_PORTS+=("${port}")
  printf '%s\n' "${port}"
}

stop_background_apps() {
  if [[ -n "${CLUB_PID}" ]]; then
    kill "${CLUB_PID}" >/dev/null 2>&1 || true
    wait "${CLUB_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${MOBILE_PID}" ]]; then
    kill "${MOBILE_PID}" >/dev/null 2>&1 || true
    wait "${MOBILE_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${DOCS_PID}" ]]; then
    kill "${DOCS_PID}" >/dev/null 2>&1 || true
    wait "${DOCS_PID}" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  local exit_code=$?

  stop_background_apps

  if [[ "${HASHPASS_KEEP_DIRECTUS_ON_EXIT:-false}" == "true" ]]; then
    echo "Keeping Directus running (HASHPASS_KEEP_DIRECTUS_ON_EXIT=true)."
    return "$exit_code"
  fi

  echo "Stopping Directus..."
  pnpm --filter hashpass-directus run down >/dev/null 2>&1 || true
  return "$exit_code"
}

trap cleanup EXIT INT TERM

MOBILE_PORT="$(claim_port "mobile app" "${MOBILE_PORT}")"
CLUB_PORT="$(claim_port "club web app" "${CLUB_PORT}")"
DOCS_PORT="$(claim_port "docs app" "${DOCS_PORT}")"

echo "Using ports: mobile=${MOBILE_PORT}, club=${CLUB_PORT}, docs=${DOCS_PORT}"

echo "Starting Directus (detached)..."
pnpm --filter hashpass-directus run up

echo "Starting mobile app..."
(
  cd apps/mobile-app
  npm run env:propagate local
  NODE_OPTIONS='--max-old-space-size=6144' pnpm exec expo start --web --clear --port "${MOBILE_PORT}"
) &
MOBILE_PID=$!

echo "Starting club web app on port ${CLUB_PORT}..."
(
  cd apps/web-app
  pnpm exec next dev --webpack --port "${CLUB_PORT}"
) &
CLUB_PID=$!

echo "Starting docs app on port ${DOCS_PORT}..."
(
  cd apps/docs
  pnpm exec docusaurus start --port "${DOCS_PORT}"
) &
DOCS_PID=$!

set +e
wait -n "$MOBILE_PID" "$CLUB_PID" "$DOCS_PID"
status=$?
set -e

exit "$status"
