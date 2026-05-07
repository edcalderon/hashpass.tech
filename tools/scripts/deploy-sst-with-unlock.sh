#!/usr/bin/env bash
set -euo pipefail

STAGE="${1:-}"

if [[ -z "${STAGE}" ]]; then
  echo "Usage: $0 <dev|production>" >&2
  exit 1
fi

case "${STAGE}" in
  prod)
    STAGE="production"
    ;;
  dev|production)
    ;;
  *)
    echo "Unsupported stage: ${STAGE}" >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="${SCRIPT_DIR}/../../packages/infra"
DEPLOY_LOG="$(mktemp)"

cleanup() {
  rm -f "${DEPLOY_LOG}"
}
trap cleanup EXIT

cd "${INFRA_DIR}"

if sst deploy --stage "${STAGE}" 2>&1 | tee "${DEPLOY_LOG}"; then
  exit 0
fi

if grep -qi 'concurrent update was detected on the app' "${DEPLOY_LOG}"; then
  echo "⚠️  SST state lock detected for ${STAGE}, unlocking and retrying once..."
  sst unlock --stage "${STAGE}"
  sst deploy --stage "${STAGE}"
  exit 0
fi

cat "${DEPLOY_LOG}" >&2
exit 1
