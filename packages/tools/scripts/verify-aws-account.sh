#!/usr/bin/env bash
set -euo pipefail

mask_account_id() {
  if [[ "${GITHUB_ACTIONS:-false}" == "true" && "${1:-}" =~ ^[0-9]{12}$ ]]; then
    printf '::add-mask::%s\n' "$1"
  fi
}

expected_account="${EXPECTED_AWS_ACCOUNT_ID:-${AWS_TARGET_ACCOUNT_ID:-}}"
mask_account_id "${expected_account}"
if [[ ! "${expected_account}" =~ ^[0-9]{12}$ ]]; then
  echo "EXPECTED_AWS_ACCOUNT_ID must be a valid 12-digit AWS account ID." >&2
  exit 1
fi

if ! caller_account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  mask_account_id "${caller_account}"
  echo "AWS caller identity lookup failed." >&2
  exit 1
fi
mask_account_id "${caller_account}"

if [[ ! "${caller_account}" =~ ^[0-9]{12}$ ]]; then
  echo "AWS caller identity lookup failed." >&2
  exit 1
fi

if [[ "${caller_account}" != "${expected_account}" ]]; then
  echo "AWS caller account does not match the expected account." >&2
  exit 1
fi

echo "AWS caller account verified."
