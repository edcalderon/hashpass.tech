#!/usr/bin/env bash
set -Eeuo pipefail

invalid_policy() {
  printf '%s\n' 'Invalid private MCP access policy.' >&2
  exit 1
}

environment_file="${1:-}"
[[ -n "$environment_file" && -f "$environment_file" ]] || invalid_policy

if ! configured_domains="$({
  awk '
    {
      line = $0
      sub(/\r$/, "", line)
      if (line ~ /^[[:space:]]*(export[[:space:]]+)?MCP_ALLOWED_EMAIL_DOMAINS[[:space:]]*=/) {
        if (found) duplicate = 1
        found = 1
        sub(/^[[:space:]]*(export[[:space:]]+)?MCP_ALLOWED_EMAIL_DOMAINS[[:space:]]*=[[:space:]]*/, "", line)
        sub(/[[:space:]]+$/, "", line)
        if (line ~ /^".*"$/ || line ~ /^'\''.*'\''$/) line = substr(line, 2, length(line) - 2)
        value = line
      }
    }
    END {
      if (!found || duplicate) exit 1
      print value
    }
  ' "$environment_file"
})"; then
  invalid_policy
fi

declare -A required_domains=(
  [hashpass.app]=1
  [hashpass.tech]=1
)
declare -A seen_domains=()

IFS=',' read -r -a domain_values <<< "$configured_domains"
for value in "${domain_values[@]}"; do
  domain="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | tr '[:upper:]' '[:lower:]')"
  [[ -n "$domain" && -n "${required_domains[$domain]+present}" && -z "${seen_domains[$domain]+present}" ]] || invalid_policy
  seen_domains[$domain]=1
done

[[ ${#seen_domains[@]} -eq ${#required_domains[@]} ]] || invalid_policy
[[ -n "${seen_domains[hashpass.app]+present}" && -n "${seen_domains[hashpass.tech]+present}" ]] || invalid_policy
