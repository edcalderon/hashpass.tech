#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${ROOT_DIR}"

LINKS_API_PORT="${LINKS_API_PORT:-}"
LINKS_API_PID=""
declare -a PORT_FLAGS=()
declare -a CLUB_ARGS=()

for arg in "$@"; do
  case "${arg}" in
    --kill-allowed|--kill-busy-ports)
      PORT_FLAGS+=("${arg}")
      ;;
    *)
      CLUB_ARGS+=("${arg}")
      ;;
  esac
done

read_env_value() {
  local file="$1"
  local name="$2"
  local value
  value="$(grep "^${name}=" "${file}" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

read_web_api_origin() {
  if [[ -n "${NEXT_PUBLIC_LINKS_API_BASE_URL:-}" ]]; then
    printf '%s' "${NEXT_PUBLIC_LINKS_API_BASE_URL}"
    return
  fi

  local file value
  for file in \
    apps/web-app/.env.development.local \
    apps/web-app/.env.local \
    apps/web-app/.env.development \
    apps/web-app/.env \
    .env.local \
    .env; do
    value="$(read_env_value "${file}" NEXT_PUBLIC_LINKS_API_BASE_URL)"
    if [[ -n "${value}" ]]; then
      printf '%s' "${value}"
      return
    fi
  done
}

API_ORIGIN="$(read_web_api_origin)"
is_local_origin="false"
if [[ -n "${API_ORIGIN}" ]]; then
  is_local_origin="$(node -e 'try { const host = new URL(process.argv[1]).hostname; process.stdout.write(["localhost", "127.0.0.1", "[::1]"].includes(host) ? "true" : "false"); } catch { process.stdout.write("false"); }' "${API_ORIGIN}")"
fi

if [[ "${is_local_origin}" != "true" ]]; then
  exec bash packages/tools/scripts/dev-command.sh club -- pnpm --filter hashpass-club-web dev "${CLUB_ARGS[@]}" "${PORT_FLAGS[@]}"
fi

configured_api_port="$(node -e 'try { const url = new URL(process.argv[1]); process.stdout.write(url.port || "8788"); } catch { process.stdout.write("8788"); }' "${API_ORIGIN}")"
LINKS_API_PORT="${LINKS_API_PORT:-${configured_api_port}}"
API_HEALTH_URL="http://127.0.0.1:${LINKS_API_PORT}/api/health"

cleanup() {
  if [[ -n "${LINKS_API_PID}" ]]; then
    kill "${LINKS_API_PID}" >/dev/null 2>&1 || true
    wait "${LINKS_API_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if curl --fail --silent --show-error --max-time 1 "${API_HEALTH_URL}" >/dev/null 2>&1; then
  printf 'links-api | Reusing local Links API on port %s.\n' "${LINKS_API_PORT}"
else
  LINKS_API_SUPABASE_URL="${SUPABASE_URL:-$(read_env_value .env EXPO_PUBLIC_SUPABASE_URL_DEV)}"
  LINKS_API_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(read_env_value .env SUPABASE_SERVICE_ROLE_KEY_DEV)}"
  LINKS_API_MAILER_HOST="${NODEMAILER_HOST:-$(read_env_value .env NODEMAILER_HOST)}"
  LINKS_API_MAILER_PORT="${NODEMAILER_PORT:-$(read_env_value .env NODEMAILER_PORT)}"
  LINKS_API_MAILER_USER="${NODEMAILER_USER:-$(read_env_value .env NODEMAILER_USER)}"
  LINKS_API_MAILER_CREDENTIAL="${NODEMAILER_PASS-}"
  if [[ -z "${LINKS_API_MAILER_CREDENTIAL}" ]]; then
    LINKS_API_MAILER_CREDENTIAL="$(read_env_value .env NODEMAILER_PASS)"
  fi
  LINKS_API_MAILER_FROM="${NODEMAILER_FROM:-$(read_env_value .env NODEMAILER_FROM)}"
  if [[ -z "${LINKS_API_SUPABASE_URL}" || -z "${LINKS_API_SERVICE_ROLE_KEY}" ]]; then
    echo "The local Links API is required for CAPTCHA and artwork publishing. Configure EXPO_PUBLIC_SUPABASE_URL_DEV and SUPABASE_SERVICE_ROLE_KEY_DEV in .env, or start it with dev:all." >&2
    exit 1
  fi
  if [[ -n "${LINKS_API_MAILER_HOST}" && -n "${LINKS_API_MAILER_USER}" && -n "${LINKS_API_MAILER_CREDENTIAL}" && -n "${LINKS_API_MAILER_FROM}" ]]; then
    printf 'links-api | Optional artwork email delivery is configured.\n'
  else
    printf 'links-api | Optional artwork email delivery is unavailable; configure NODEMAILER_HOST/USER/PASS/FROM in .env.\n'
  fi

  printf 'links-api | Starting local Links API on port %s...\n' "${LINKS_API_PORT}"
  CREDENTIAL_ENV_KEY='NODEMAILER_PASS'
  env \
    "PORT=${LINKS_API_PORT}" \
    "SUPABASE_URL=${LINKS_API_SUPABASE_URL}" \
    "SUPABASE_SERVICE_ROLE_KEY=${LINKS_API_SERVICE_ROLE_KEY}" \
    "NODEMAILER_HOST=${LINKS_API_MAILER_HOST}" \
    "NODEMAILER_PORT=${LINKS_API_MAILER_PORT}" \
    "NODEMAILER_USER=${LINKS_API_MAILER_USER}" \
    "${CREDENTIAL_ENV_KEY}=${LINKS_API_MAILER_CREDENTIAL}" \
    "NODEMAILER_FROM=${LINKS_API_MAILER_FROM}" \
    bash packages/tools/scripts/dev-command.sh links-api "${PORT_FLAGS[@]}" -- pnpm --filter @hashpass/hashpass-links-api dev &
  LINKS_API_PID=$!

  api_ready="false"
  for _ in $(seq 1 40); do
    if curl --fail --silent --show-error --max-time 1 "${API_HEALTH_URL}" >/dev/null 2>&1; then
      api_ready="true"
      break
    fi
    if ! kill -0 "${LINKS_API_PID}" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
  if [[ "${api_ready}" != "true" ]]; then
    echo "The local Links API did not become ready at ${API_HEALTH_URL}. Check the links-api startup output above." >&2
    exit 1
  fi
fi

bash packages/tools/scripts/dev-command.sh club -- pnpm --filter hashpass-club-web dev "${CLUB_ARGS[@]}" "${PORT_FLAGS[@]}"
