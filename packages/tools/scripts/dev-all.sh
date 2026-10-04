#!/usr/bin/env bash
set -euo pipefail

MOBILE_PID=""
CLUB_PID=""
DOCS_PID=""
VIDEO_STUDIO_PID=""
LINKS_API_PID=""
LOCALPROOF_PID=""
declare -a RESERVED_PORTS=()
CLUB_PORT="${CLUB_PORT:-3000}"
DOCS_PORT="${DOCS_PORT:-3101}"
VIDEO_STUDIO_PORT="${VIDEO_STUDIO_PORT:-3105}"
LOCALPROOF_PORT="${LOCALPROOF_PORT:-3200}"
# Keep the Expo web app on 8081 so it stays out of the club app's 3000 slot.
MOBILE_PORT="${MOBILE_PORT:-8081}"
# Matches NEXT_PUBLIC_LINKS_API_BASE_URL / EXPO_PUBLIC_LINKS_API_BASE_URL's
# hardcoded default in the root .env -- if this is overridden, keep those in
# sync too (same caveat as MOBILE_PORT/CLUB_PORT above).
LINKS_API_PORT="${LINKS_API_PORT:-8788}"
NODE_MAX_OLD_SPACE_SIZE="${NODE_MAX_OLD_SPACE_SIZE:-12288}"
EXPO_WEB_MAX_WORKERS="${EXPO_WEB_MAX_WORKERS:-2}"
DIRECTUS_PING_URL="${DIRECTUS_PING_URL:-http://127.0.0.1:8055/server/ping}"
DIRECTUS_READY_TIMEOUT_SECONDS="${DIRECTUS_READY_TIMEOUT_SECONDS:-90}"
# Matches apps/frappe-helpdesk-dev's own FRAPPE_LOCAL_HTTP_PORT default --
# kept as a separate var name here since it's what every other port in this
# script is called (claim_port's label), while FRAPPE_LOCAL_HTTP_PORT is the
# name the compose override and its wrapper script already read.
FRAPPE_HELPDESK_PORT="${FRAPPE_HELPDESK_PORT:-8083}"
FRAPPE_HELPDESK_PING_URL="${FRAPPE_HELPDESK_PING_URL:-http://127.0.0.1:${FRAPPE_HELPDESK_PORT}/api/method/ping}"
FRAPPE_HELPDESK_READY_TIMEOUT_SECONDS="${FRAPPE_HELPDESK_READY_TIMEOUT_SECONDS:-180}"
# Opt-in: when a reserved port is already busy, kill whatever holds it and
# reuse the SAME port -- dev:all never silently falls back to a different
# port (that's what caused hours of "why is my browser talking to a stale
# process on the wrong port" confusion before this existed). Default is off:
# a busy port is a hard failure with a clear diagnostic, not a quiet retry.
# Settable either as an env var (KILL_BUSY_PORTS=true npm run dev:all) or as
# a CLI flag (npm run dev:all -- --kill-allowed) -- the flag wins if both are
# given, since it's the more explicit, harder-to-leave-on-by-accident form.
KILL_BUSY_PORTS="${KILL_BUSY_PORTS:-false}"
# On by default -- the point of wiring this in is so `npm run dev:all`
# actually simulates the real Contact Support / live ticket chat flow
# end-to-end without any extra step. Skip it (e.g. for unrelated work, or to
# avoid the Docker/image overhead) with SKIP_FRAPPE_HELPDESK=true or
# --skip-frappe-helpdesk.
SKIP_FRAPPE_HELPDESK="${SKIP_FRAPPE_HELPDESK:-false}"
# Opt-in: the LocalProof site (apps/localproof-site) is a static marketing/
# docs page unrelated to most dev work. Start it with --local-proof (or
# INCLUDE_LOCALPROOF=true) to serve it on LOCALPROOF_PORT (default 3200).
INCLUDE_LOCALPROOF="${INCLUDE_LOCALPROOF:-false}"

for arg in "$@"; do
  case "${arg}" in
    --kill-allowed|--kill-busy-ports)
      KILL_BUSY_PORTS=true
      ;;
    --skip-frappe-helpdesk)
      SKIP_FRAPPE_HELPDESK=true
      ;;
    --local-proof|--localproof)
      INCLUDE_LOCALPROOF=true
      ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      echo "Usage: dev-all.sh [--kill-allowed] [--skip-frappe-helpdesk] [--local-proof]" >&2
      exit 1
      ;;
  esac
done

# Snapshot of the user's actual request, before a failed startup below can
# flip SKIP_FRAPPE_HELPDESK for the rest of this run -- see cleanup()'s use
# of this vs. the mutable flag.
readonly SKIP_FRAPPE_HELPDESK_REQUESTED="${SKIP_FRAPPE_HELPDESK}"

port_is_busy() {
  local port="$1"

  # `lsof`/`ss` can exist but be denied access to the socket table (notably
  # in sandboxed shells). A failed inspection must not be treated as proof
  # that the port is free; fall through to the TCP connection probe instead.
  if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
  fi

  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :${port} )" 2>/dev/null | awk 'NR > 1 { found = 1 } END { exit !found }'; then
      return 0
    fi
  fi

  if (exec 3<>"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1; then
    return 0
  fi

  return 1
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

print_port_holder() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | sed 's/^/   /' >&2
  fi
}

kill_port_holder() {
  local port="$1"
  local pids=""

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tnP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  fi

  if [[ -z "${pids}" ]] && command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "${port}/tcp" 2>/dev/null | tr -s ' \t' ' ' || true)"
  fi

  if [[ -z "${pids//[[:space:]]/}" ]]; then
    echo "   Could not identify which process holds port ${port} (lsof/fuser unavailable or denied) -- cannot kill it automatically." >&2
    return 1
  fi

  echo "   Killing process(es) on port ${port}: ${pids}" >&2
  # shellcheck disable=SC2086
  kill -9 ${pids} >/dev/null 2>&1 || true

  local waited=0
  while port_is_busy "${port}" && (( waited < 20 )); do
    sleep 0.5
    waited=$((waited + 1))
  done

  if port_is_busy "${port}"; then
    echo "   Port ${port} is still busy 10s after attempting to kill its holder." >&2
    return 1
  fi

  return 0
}

# Reserves exactly the requested port -- never a different one. A busy port
# is either a hard failure (default) or, with KILL_BUSY_PORTS=true, gets its
# holder killed so the same port can still be used.
claim_port() {
  local label="$1"
  local port="$2"

  if port_is_reserved "${port}"; then
    echo "Port ${port} was requested twice in this script (label: ${label}) -- that's a config bug, not a runtime conflict." >&2
    return 1
  fi

  if port_is_busy "${port}"; then
    if [[ "${KILL_BUSY_PORTS}" == "true" ]]; then
      echo "Port ${port} (${label}) is busy; KILL_BUSY_PORTS=true, freeing it..." >&2
      print_port_holder "${port}"
      if ! kill_port_holder "${port}"; then
        echo "Failed to free port ${port} for ${label}. Aborting -- dev:all does not fall back to a different port." >&2
        return 1
      fi
      echo "Port ${port} is now free; ${label} will use it." >&2
    else
      echo "" >&2
      echo "Port ${port} (needed for ${label}) is already in use:" >&2
      print_port_holder "${port}"
      echo "" >&2
      echo "dev:all does not silently fall back to a different port. Free port ${port} yourself," >&2
      echo "or re-run with KILL_BUSY_PORTS=true to have dev:all kill whatever holds it and reuse it." >&2
      echo "" >&2
      return 1
    fi
  fi

  RESERVED_PORTS+=("${port}")
  echo "${label}: using port ${port}" >&2
  printf '%s\n' "${port}"
}

# Reads a single value out of the root .env without sourcing the whole
# file into this script's environment -- broadly exporting every var in
# there (bare, _DEV, and _PROD alike) would leak into every child process
# below and get picked up by their own dotenv loaders ahead of the
# per-app .env/.env.local files those already correctly generate, silently
# overriding them. Last matching line wins, same precedence `dotenv.parse()`
# (used by propagate-env.js) and bash `source` both use for a repeated key.
read_root_env_value() {
  local name="$1"
  grep "^${name}=" .env 2>/dev/null | tail -n1 | cut -d= -f2-
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

wait_for_frappe_helpdesk() {
  local deadline=$((SECONDS + FRAPPE_HELPDESK_READY_TIMEOUT_SECONDS))
  local ping_url="$FRAPPE_HELPDESK_PING_URL"

  echo "Waiting for local Frappe Helpdesk at ${ping_url}..."

  while (( SECONDS < deadline )); do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 2 "${ping_url}" >/dev/null 2>&1; then
        echo "Local Frappe Helpdesk is ready."
        return 0
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget --quiet --tries=1 --spider "${ping_url}" >/dev/null 2>&1; then
        echo "Local Frappe Helpdesk is ready."
        return 0
      fi
    else
      echo "Neither curl nor wget is available; skipping Frappe Helpdesk readiness check."
      return 0
    fi

    sleep 3
  done

  echo "Local Frappe Helpdesk did not become ready within ${FRAPPE_HELPDESK_READY_TIMEOUT_SECONDS}s." >&2
  echo "Check logs: pnpm --filter hashpass-frappe-helpdesk-dev run logs" >&2
  return 1
}

# True when apps/mobile-app/.env.local is still missing working Frappe
# credentials -- used to skip re-running seed (which hits a real Frappe REST
# API a few times) once a previous dev:all run already populated it.
frappe_helpdesk_needs_seed() {
  local env_local="apps/mobile-app/.env.local"

  if [[ ! -f "${env_local}" ]]; then
    return 0
  fi

  if grep -q '^FRAPPE_BASE_URL=.\+' "${env_local}" 2>/dev/null \
    && grep -q '^FRAPPE_SUPPORT_READ_API_KEY=.\+' "${env_local}" 2>/dev/null \
    && grep -q '^FRAPPE_SUPPORT_WRITE_API_KEY=.\+' "${env_local}" 2>/dev/null; then
    return 1
  fi

  return 0
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

  if [[ -n "${VIDEO_STUDIO_PID}" ]]; then
    kill "${VIDEO_STUDIO_PID}" >/dev/null 2>&1 || true
    wait "${VIDEO_STUDIO_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${LINKS_API_PID}" ]]; then
    kill "${LINKS_API_PID}" >/dev/null 2>&1 || true
    wait "${LINKS_API_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${LOCALPROOF_PID}" ]]; then
    kill "${LOCALPROOF_PID}" >/dev/null 2>&1 || true
    wait "${LOCALPROOF_PID}" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  local exit_code=$?

  # Disable the trap immediately, before doing anything else. Without this,
  # a `return` from a function invoked as an EXIT/INT/TERM trap handler (not
  # a normal call) can corrupt bash's call-stack bookkeeping on some builds
  # -- observed as `pop_var_context: head of shell_variables not a function
  # context` -- and/or cause this same handler to re-fire a second time
  # (visible as "Stopping Directus..."/"Stopping local Frappe Helpdesk..."
  # each printing twice). Clearing the trap first, and using `exit` instead
  # of `return` below, makes this handler safe to run exactly once no matter
  # which signal triggered it.
  trap - EXIT INT TERM

  stop_background_apps

  if [[ "${HASHPASS_KEEP_DIRECTUS_ON_EXIT:-false}" == "true" ]]; then
    echo "Keeping Directus running (HASHPASS_KEEP_DIRECTUS_ON_EXIT=true)."
  else
    echo "Stopping Directus..."
    pnpm --filter hashpass-directus run down >/dev/null 2>&1 || true
  fi

  # Uses the ORIGINAL flag (before a failed startup flips SKIP_FRAPPE_HELPDESK
  # for the rest of the run, below) so a partially-started stack -- e.g.
  # mariadb came up but frontend didn't -- still gets torn down. `down` on
  # containers that never came up at all is a harmless no-op.
  if [[ "${SKIP_FRAPPE_HELPDESK_REQUESTED}" != "true" ]]; then
    if [[ "${HASHPASS_KEEP_FRAPPE_ON_EXIT:-false}" == "true" ]]; then
      echo "Keeping local Frappe Helpdesk running (HASHPASS_KEEP_FRAPPE_ON_EXIT=true)."
    else
      echo "Stopping local Frappe Helpdesk..."
      pnpm --filter hashpass-frappe-helpdesk-dev run down >/dev/null 2>&1 || true
    fi
  fi

  exit "$exit_code"
}

trap cleanup EXIT INT TERM

MOBILE_PORT="$(claim_port "mobile app" "${MOBILE_PORT}")"
CLUB_PORT="$(claim_port "club web app" "${CLUB_PORT}")"
DOCS_PORT="$(claim_port "docs app" "${DOCS_PORT}")"
VIDEO_STUDIO_PORT="$(claim_port "video studio" "${VIDEO_STUDIO_PORT}")"
LINKS_API_PORT="$(claim_port "hashpass-links-api" "${LINKS_API_PORT}")"

if [[ "${INCLUDE_LOCALPROOF}" == "true" ]]; then
  LOCALPROOF_PORT="$(claim_port "localproof site" "${LOCALPROOF_PORT}")"
fi

if [[ "${SKIP_FRAPPE_HELPDESK}" != "true" && "${INCLUDE_LOCALPROOF}" == "true" ]]; then
  echo "Using ports: mobile=${MOBILE_PORT}, club=${CLUB_PORT}, docs=${DOCS_PORT}, video-studio=${VIDEO_STUDIO_PORT}, links-api=${LINKS_API_PORT}, frappe-helpdesk=${FRAPPE_HELPDESK_PORT}, localproof=${LOCALPROOF_PORT}"
elif [[ "${SKIP_FRAPPE_HELPDESK}" != "true" ]]; then
  echo "Using ports: mobile=${MOBILE_PORT}, club=${CLUB_PORT}, docs=${DOCS_PORT}, video-studio=${VIDEO_STUDIO_PORT}, links-api=${LINKS_API_PORT}, frappe-helpdesk=${FRAPPE_HELPDESK_PORT}"
elif [[ "${INCLUDE_LOCALPROOF}" == "true" ]]; then
  echo "Using ports: mobile=${MOBILE_PORT}, club=${CLUB_PORT}, docs=${DOCS_PORT}, video-studio=${VIDEO_STUDIO_PORT}, links-api=${LINKS_API_PORT}, localproof=${LOCALPROOF_PORT} (Frappe Helpdesk skipped)"
else
  echo "Using ports: mobile=${MOBILE_PORT}, club=${CLUB_PORT}, docs=${DOCS_PORT}, video-studio=${VIDEO_STUDIO_PORT}, links-api=${LINKS_API_PORT} (Frappe Helpdesk skipped)"
fi

echo "Starting Directus (detached)..."
pnpm --filter hashpass-directus run up

if [[ "${SKIP_FRAPPE_HELPDESK}" != "true" ]]; then
  echo "Starting local Frappe Helpdesk (detached) on port ${FRAPPE_HELPDESK_PORT}..."
  # FRAPPE_LOCAL_HTTP_PORT is the name apps/frappe-helpdesk-dev's own compose
  # override and compose.sh already read (see that package's README) --
  # exporting it here is what makes docker compose's own port interpolation
  # and this script's FRAPPE_HELPDESK_PORT agree on the same port.
  #
  # Non-fatal on failure (missing ops/self-hosted/.env, Docker not running,
  # etc.): this is genuinely optional local infra for one feature (Contact
  # Support / ticket chat simulation), and the mobile app's own
  # frappe-support-client already degrades to a clear per-request config
  # error rather than crashing -- dev:all shouldn't take down club/docs/mobile
  # over it. Falls back to SKIP_FRAPPE_HELPDESK for the rest of this run so
  # the later wait/seed steps don't also try and fail.
  if ! FRAPPE_LOCAL_HTTP_PORT="${FRAPPE_HELPDESK_PORT}" pnpm --filter hashpass-frappe-helpdesk-dev run up; then
    echo "WARNING: failed to start local Frappe Helpdesk -- Contact Support / ticket chat will show its config error locally. See apps/frappe-helpdesk-dev/README.md." >&2
    SKIP_FRAPPE_HELPDESK=true
  fi
fi

echo "Starting club web app on port ${CLUB_PORT}..."
CLUB_RUNTIME_DIR="$(node packages/tools/scripts/prepare-club-dev-runtime.mjs "${CLUB_PORT}")"
(
  cd "${CLUB_RUNTIME_DIR}"
  pnpm exec next dev --webpack --port "${CLUB_PORT}"
) &
CLUB_PID=$!

echo "Starting hashpass-links-api on port ${LINKS_API_PORT}..."
# HashPass Auth (QR login) needs its session-issuing backend talking to the
# SAME Supabase project apps/mobile-app's core-development profile already
# resolves to on localhost (EXPO_PUBLIC_SUPABASE_URL_DEV) and apps/web-app's
# bare NEXT_PUBLIC_SUPABASE_URL is set to for local dev -- deliberately the
# _DEV project (gsugeqozyeokncpbndna), not whatever the ambiguous bare
# SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fallback happens to hold (those
# double as core-production's own fallback chain, see .env's comments).
# Mismatched projects here is exactly what caused club web's setSession() to
# fail with "invalid JWT: unable to parse or verify signature" while the
# mobile app still reported "Login approved".
LINKS_API_SUPABASE_URL="$(read_root_env_value EXPO_PUBLIC_SUPABASE_URL_DEV)"
LINKS_API_SERVICE_ROLE_KEY="$(read_root_env_value SUPABASE_SERVICE_ROLE_KEY_DEV)"
if [[ -z "${LINKS_API_SUPABASE_URL}" || -z "${LINKS_API_SERVICE_ROLE_KEY}" ]]; then
  echo "EXPO_PUBLIC_SUPABASE_URL_DEV / SUPABASE_SERVICE_ROLE_KEY_DEV missing from .env -- cannot start hashpass-links-api." >&2
  exit 1
fi
(
  cd packages/hashpass-links-api
  PORT="${LINKS_API_PORT}" SUPABASE_URL="${LINKS_API_SUPABASE_URL}" SUPABASE_SERVICE_ROLE_KEY="${LINKS_API_SERVICE_ROLE_KEY}" \
    pnpm exec tsx dev-server.ts
) &
LINKS_API_PID=$!

echo "Starting docs app on port ${DOCS_PORT}..."
(
  cd apps/docs
  pnpm exec docusaurus start --port "${DOCS_PORT}"
) &
DOCS_PID=$!

echo "Starting video studio (Remotion) on port ${VIDEO_STUDIO_PORT}..."
(
  cd apps/video-studio
  pnpm exec remotion studio --port "${VIDEO_STUDIO_PORT}"
) &
VIDEO_STUDIO_PID=$!

if [[ "${INCLUDE_LOCALPROOF}" == "true" ]]; then
  echo "Starting LocalProof site on port ${LOCALPROOF_PORT}..."
  (
    cd apps/localproof-site
    python3 -m http.server "${LOCALPROOF_PORT}"
  ) &
  LOCALPROOF_PID=$!
fi

wait_for_directus

if [[ "${SKIP_FRAPPE_HELPDESK}" != "true" ]]; then
  # Non-fatal on timeout, same posture as the `up` step above: this is
  # optional local infra for one feature, and under `set -e` a bare failed
  # call here would tear down the whole session (Directus, club, docs,
  # video-studio, links-api -- all unrelated and otherwise healthy) just
  # because Frappe Helpdesk took too long to report ready. Falls back to
  # SKIP_FRAPPE_HELPDESK so the seed step below is skipped too.
  if ! wait_for_frappe_helpdesk; then
    echo "WARNING: local Frappe Helpdesk did not become ready in time -- continuing dev:all without it. Contact Support / ticket chat will show its config error locally. Check logs (pnpm --filter hashpass-frappe-helpdesk-dev run logs) and re-run 'pnpm --filter hashpass-frappe-helpdesk-dev run up' once it's healthy -- the mobile app will pick it up on the next request, no restart needed." >&2
    SKIP_FRAPPE_HELPDESK=true
  fi
fi

if [[ "${SKIP_FRAPPE_HELPDESK}" != "true" ]]; then
  if frappe_helpdesk_needs_seed; then
    echo "Seeding local Frappe Helpdesk service users (apps/mobile-app/.env.local is missing or incomplete)..."
    FRAPPE_LOCAL_HTTP_PORT="${FRAPPE_HELPDESK_PORT}" pnpm --filter hashpass-frappe-helpdesk-dev run seed
  else
    echo "apps/mobile-app/.env.local already has Frappe Helpdesk credentials -- skipping seed."
  fi
fi

echo "Starting mobile app..."
(
  cd apps/mobile-app
  npm run env:propagate local
  EXPO_NO_METRO_WORKSPACE_ROOT=1 NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" pnpm exec expo start --web --max-workers "${EXPO_WEB_MAX_WORKERS}" --port "${MOBILE_PORT}"
) &
MOBILE_PID=$!

set +e
WAIT_PIDS=("$MOBILE_PID" "$CLUB_PID" "$DOCS_PID" "$VIDEO_STUDIO_PID" "$LINKS_API_PID")
if [[ -n "${LOCALPROOF_PID}" ]]; then
  WAIT_PIDS+=("${LOCALPROOF_PID}")
fi
wait -n "${WAIT_PIDS[@]}"
status=$?
set -e

exit "$status"
