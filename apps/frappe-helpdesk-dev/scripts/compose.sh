#!/usr/bin/env bash
set -euo pipefail

# Mirrors apps/directus/scripts/compose.sh's shape deliberately -- same
# compose-detection, same network-ensure-before-up pattern -- so a developer
# who already knows one knows both. The real difference is *which* compose
# files this wraps: the pinned ops/self-hosted/frappe/compose.yaml (the same
# file the production runbook deploys, see ops/self-hosted/README.md) plus
# this package's docker-compose.local.yml port-publishing override, never a
# second copy of the stack definition.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${PACKAGE_DIR}/../.." && pwd)"
SELF_HOSTED_DIR="${REPO_ROOT}/ops/self-hosted"
ENV_FILE="${SELF_HOSTED_DIR}/.env"
BASE_COMPOSE="${SELF_HOSTED_DIR}/frappe/compose.yaml"
LOCAL_OVERRIDE="${PACKAGE_DIR}/docker-compose.local.yml"

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    echo "WARNING: using legacy docker-compose v1 compatibility mode."
    return 0
  fi

  echo "ERROR: Docker Compose not found."
  exit 1
}

run_compose() {
  "${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" -f "${BASE_COMPOSE}" -f "${LOCAL_OVERRIDE}" "$@"
}

ensure_ops_network() {
  # frappe-frontend joins this external network in the base compose file
  # (shared with Caddy in production). Locally nothing else needs to be on
  # it; it only has to exist so `docker compose up` doesn't refuse to start.
  if docker network inspect hashpass-ops >/dev/null 2>&1; then
    return 0
  fi

  docker network create hashpass-ops >/dev/null
}

ensure_env_file() {
  if [[ -f "${ENV_FILE}" ]]; then
    return 0
  fi

  echo "ERROR: ${ENV_FILE} is missing." >&2
  echo "Generate it first, e.g.:" >&2
  echo "  DB_PW=\$(openssl rand -hex 24); ADMIN_PW=\$(openssl rand -hex 16)" >&2
  echo "  cat > ${ENV_FILE} <<EOF" >&2
  echo "FRAPPE_IMAGE=ghcr.io/frappe/helpdesk:v1.30.1" >&2
  echo "FRAPPE_SITE_NAME=frappe.localhost" >&2
  # Single-quoted here (unlike the sibling echo lines above) so these print
  # the literal placeholder text with no bash escaping needed at all -- $DB_PW
  # isn't actually set in this script, we're just showing the user what to
  # paste into their own .env.
  echo '  FRAPPE_DB_ROOT_PASSWORD=${DB_PW}' >&2
  echo '  MARIADB_ROOT_PASSWORD=${DB_PW}' >&2
  echo '  FRAPPE_ADMIN_PASSWORD=${ADMIN_PW}' >&2
  echo "EOF" >&2
  exit 1
}

cmd="${1:-dev}"
shift || true

detect_compose
ensure_env_file
ensure_ops_network

case "$cmd" in
  dev)
    run_compose up "$@"
    ;;
  up)
    # Deliberately doesn't block on readiness -- matches apps/directus's own
    # `up` shape. Readiness waiting is dev-all.sh's job (wait_for_frappe_helpdesk),
    # since it starts this alongside other services and only the mobile app
    # actually needs to wait on it. Run `doctor` or hit /api/method/ping
    # yourself if you want a blocking check from the CLI directly.
    run_compose up -d "$@"
    ;;
  down)
    run_compose down "$@"
    ;;
  logs)
    run_compose logs -f "$@"
    ;;
  restart)
    run_compose restart "$@"
    ;;
  reset)
    # Full local reset -- wipes the site DB too, since this is a throwaway
    # dev instance, not something anyone expects to survive a reset.
    run_compose down --remove-orphans --volumes || true
    run_compose up -d "$@"
    ;;
  doctor)
    echo "Compose command: ${COMPOSE_CMD[*]}"
    run_compose version
    docker version --format 'Docker Engine {{.Server.Version}}'
    run_compose config --quiet && echo "Compose config OK."
    ;;
  *)
    echo "Unknown command: $cmd"
    echo "Usage: compose.sh {dev|up|down|logs|restart|reset|doctor}"
    exit 2
    ;;
esac
