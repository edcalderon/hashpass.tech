#!/usr/bin/env bash
set -euo pipefail

service="${1:-}"
if [[ -z "${service}" ]]; then
  echo "Usage: dev-command.sh <mobile|club|companion|directus|video-studio|docs> -- <command...> [--kill-allowed]" >&2
  exit 2
fi
shift

if [[ "${1:-}" == "--" ]]; then
  shift
fi

KILL_BUSY_PORTS="${KILL_BUSY_PORTS:-false}"
declare -a child_command=()
runtime_separator_skipped=false
for arg in "$@"; do
  case "${arg}" in
    --kill-allowed|--kill-busy-ports)
      KILL_BUSY_PORTS=true
      ;;
    --)
      # npm/pnpm insert one separator before arguments supplied after `run`.
      # Consume that wrapper token while preserving any later `--` intended
      # for the actual development command.
      if [[ "${runtime_separator_skipped}" == "false" ]]; then
        runtime_separator_skipped=true
      else
        child_command+=("${arg}")
      fi
      ;;
    *)
      child_command+=("${arg}")
      ;;
  esac
done

if (( ${#child_command[@]} == 0 )); then
  echo "No development command was provided for ${service}." >&2
  exit 2
fi

port_is_busy() {
  local port="$1"

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

print_port_holder() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | sed 's/^/   /' >&2
  fi
}

kill_port_holder() {
  local port="$1"
  local raw_pids=""
  local pid
  local waited=0
  local -a pids=()
  local -a raw_pid_list=()

  if command -v lsof >/dev/null 2>&1; then
    raw_pids="$(lsof -tnP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  fi

  if [[ -z "${raw_pids//[[:space:]]/}" ]] && command -v fuser >/dev/null 2>&1; then
    raw_pids="$(fuser "${port}/tcp" 2>/dev/null | tr -s ' \t' ' ' || true)"
  fi

  raw_pids="${raw_pids//$'\n'/ }"
  read -r -a raw_pid_list <<< "${raw_pids}"
  for pid in "${raw_pid_list[@]}"; do
    if [[ "${pid}" =~ ^[0-9]+$ ]]; then
      pids+=("${pid}")
    fi
  done

  if (( ${#pids[@]} == 0 )); then
    echo "   Could not identify the process holding port ${port} (lsof/fuser unavailable or denied); cannot kill it automatically." >&2
    return 1
  fi

  echo "   Killing process(es) on port ${port}: ${pids[*]}" >&2
  kill -9 "${pids[@]}" >/dev/null 2>&1 || true

  while port_is_busy "${port}" && (( waited < 20 )); do
    sleep 0.5
    waited=$((waited + 1))
  done

  if port_is_busy "${port}"; then
    echo "   Port ${port} is still busy 10s after attempting to kill its holder." >&2
    return 1
  fi
}

read_root_env_value() {
  local name="$1"
  local value
  value="$(grep "^${name}=" .env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

argument_port=""
for ((i = 0; i < ${#child_command[@]}; i++)); do
  case "${child_command[i]}" in
    --port=*) argument_port="${child_command[i]#*=}" ;;
    --port|-p)
      if (( i + 1 < ${#child_command[@]} )); then
        argument_port="${child_command[i + 1]}"
      fi
      ;;
  esac
done

case "${service}" in
  mobile)
    port="${argument_port:-${EXPO_WEB_PORT:-8081}}"
    ;;
  club)
    port="${argument_port:-${CLUB_PORT:-${PORT:-3000}}}"
    ;;
  companion)
    port="${argument_port:-${COMPANION_PORT:-${VITE_PORT:-5173}}}"
    ;;
  directus)
    port="${argument_port:-${DIRECTUS_PORT:-$(read_root_env_value DIRECTUS_PORT)}}"
    port="${port:-8055}"
    ;;
  video-studio)
    port="${argument_port:-${VIDEO_STUDIO_PORT:-3000}}"
    ;;
  docs)
    port="${argument_port:-${DOCS_PORT:-3000}}"
    ;;
  *)
    echo "Unknown development service: ${service}" >&2
    exit 2
    ;;
esac

# The root mobile shortcuts historically propagated local environment before
# delegating to the Expo package script. Keep that behavior for ordinary runs.
if [[ "${service}" == "mobile" ]]; then
  npm run env:propagate local
fi

if [[ "${KILL_BUSY_PORTS}" == "true" ]]; then
  if port_is_busy "${port}"; then
    echo "Port ${port} (${service}) is busy; --kill-allowed permits freeing it." >&2

    # Directus owns its port through Docker Compose. Stop this project's
    # containers first so Compose can release the port cleanly before falling
    # back to killing a remaining host process.
    if [[ "${service}" == "directus" ]]; then
      pnpm --filter hashpass-directus run down || true
    fi

    if port_is_busy "${port}"; then
      print_port_holder "${port}"
      kill_port_holder "${port}" || {
        echo "Failed to free port ${port} for ${service}; refusing to start on a different port." >&2
        exit 1
      }
    fi
    echo "Port ${port} is free; ${service} will use it." >&2
  else
    echo "Port ${port} (${service}) is already free." >&2
  fi

  case "${service}" in
    mobile)
      export EXPO_WEB_PORT="${port}"
      ;;
    club)
      export PORT="${port}"
      ;;
    directus)
      export DIRECTUS_PORT="${port}"
      ;;
    companion)
      if [[ -z "${argument_port}" ]]; then
        child_command+=(--port "${port}")
      fi
      if [[ ! " ${child_command[*]} " =~ [[:space:]]--strictPort[[:space:]] ]]; then
        child_command+=(--strictPort)
      fi
      ;;
    video-studio|docs)
      if [[ -z "${argument_port}" ]]; then
        child_command+=(--port "${port}")
      fi
      ;;
  esac
fi

exec "${child_command[@]}"
