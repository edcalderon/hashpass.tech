#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    COMPOSE_MODE="v2"
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    if [[ "${HASHPASS_DISABLE_DOCKER_COMPOSE_V1:-false}" == "true" ]]; then
      echo "ERROR: docker-compose v1 found, but disabled by HASHPASS_DISABLE_DOCKER_COMPOSE_V1=true"
      echo "Install Docker Compose v2 plugin (docker compose) and retry."
      exit 1
    fi

    COMPOSE_CMD=(docker-compose)
    COMPOSE_MODE="v1"
    echo "WARNING: using legacy docker-compose v1 compatibility mode."
    echo "Install Docker Compose v2 plugin (docker compose) when possible."
    return 0
  fi

  echo "ERROR: Docker Compose not found."
  echo "Install Docker Desktop / docker compose plugin and retry."
  exit 1
}

run_compose() {
  "${COMPOSE_CMD[@]}" "$@"
}

legacy_v1_cleanup() {
  if [[ "${COMPOSE_MODE:-}" != "v1" ]]; then
    return 0
  fi

  # Prevent common docker-compose v1 KeyError('ContainerConfig') on recreate.
  run_compose down --remove-orphans >/dev/null 2>&1 || true
  docker rm -f hashpass-directus-sso >/dev/null 2>&1 || true
}

cmd="${1:-dev}"
shift || true

detect_compose

case "$cmd" in
  dev)
    legacy_v1_cleanup
    run_compose up "$@"
    ;;
  up)
    legacy_v1_cleanup
    run_compose up -d "$@"
    ;;
  down)
    run_compose down "$@"
    ;;
  logs)
    run_compose logs -f "$@"
    ;;
  restart)
    legacy_v1_cleanup
    run_compose restart "$@"
    ;;
  reset)
    # Full local reset for stuck legacy containers/volumes.
    run_compose down --remove-orphans --volumes || true
    docker rm -f hashpass-directus-sso >/dev/null 2>&1 || true
    run_compose up -d "$@"
    ;;
  doctor)
    echo "Compose command: ${COMPOSE_CMD[*]}"
    run_compose version
    docker version --format 'Docker Engine {{.Server.Version}}'
    ;;
  *)
    echo "Unknown command: $cmd"
    echo "Usage: compose.sh {dev|up|down|logs|restart|reset|doctor}"
    exit 2
    ;;
esac
