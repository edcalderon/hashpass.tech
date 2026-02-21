#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

APP_ID="${1:-d951nuj7hrqeg}"
REGION="${2:-us-east-1}"
HEADERS_FILE="${3:-${ROOT_DIR}/infrastructure/terraform/stacks/aws/custom-headers.blockchainsummit.yml}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required"
  exit 1
fi

if [[ ! -f "${HEADERS_FILE}" ]]; then
  echo "Headers file not found: ${HEADERS_FILE}"
  exit 1
fi

echo "Applying Amplify custom headers..."
echo "  app:    ${APP_ID}"
echo "  region: ${REGION}"
echo "  file:   ${HEADERS_FILE}"

aws amplify update-app \
  --app-id "${APP_ID}" \
  --region "${REGION}" \
  --custom-headers "file://${HEADERS_FILE}" \
  --query 'app.{appId:appId,name:name,updateTime:updateTime}' \
  --output table

echo
echo "Custom headers now configured on Amplify app:"
aws amplify get-app \
  --app-id "${APP_ID}" \
  --region "${REGION}" \
  --query 'app.customHeaders' \
  --output text
