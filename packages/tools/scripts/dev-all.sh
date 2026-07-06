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
NODE_MAX_OLD_SPACE_SIZE="${NODE_MAX_OLD_SPACE_SIZE:-12288}"
EXPO_WEB_MAX_WORKERS="${EXPO_WEB_MAX_WORKERS:-2}"
DIRECTUS_PING_URL="${DIRECTUS_PING_URL:-http://127.0.0.1:8055/server/ping}"
DIRECTUS_READY_TIMEOUT_SECONDS="${DIRECTUS_READY_TIMEOUT_SECONDS:-90}"

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

wait_for_directus() {
  local deadline=$((SECONDS + DIRECTUS_READY_TIMEOUT_SECONDS))
  local ping_url="$DIRECTUS_PING_URL"

  echo "Waiting for Directus at ${ping_url}..."

  while (( SECONDS < deadline )); do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 2 "${ping_url}" >/dev/null 2>&1; then
        echo "Directus is ready."
        return 0
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget --quiet --tries=1 --spider "${ping_url}" >/dev/null 2>&1; then
        echo "Directus is ready."
        return 0
      fi
    else
      echo "Neither curl nor wget is available; skipping Directus readiness check."
      return 0
    fi

    sleep 2
  done

  echo "Directus did not become ready within ${DIRECTUS_READY_TIMEOUT_SECONDS}s." >&2
  return 1
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

wait_for_directus

echo "Starting mobile app..."
(
  cd apps/mobile-app
  npm run env:propagate local
  EXPO_NO_METRO_WORKSPACE_ROOT=1 NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" pnpm exec expo start --web --max-workers "${EXPO_WEB_MAX_WORKERS}" --port "${MOBILE_PORT}"
) &
MOBILE_PID=$!

set +e
wait -n "$MOBILE_PID" "$CLUB_PID" "$DOCS_PID"
status=$?
set -e

exit "$status"
