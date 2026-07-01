#!/usr/bin/env bash
set -euo pipefail

EXPECTED_ACCOUNT_ID="${TARGET_AWS_ACCOUNT_ID:-${EXPECTED_AWS_ACCOUNT_ID:-${AWS_ACCOUNT_ID:-}}}"
DOMAIN_NAME="${DOMAIN_NAME:-hashpass.tech}"
TARGET_STAGES=("bsl.hashpass.tech" "bsl-dev.hashpass.tech")

CURRENT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [[ -z "${CURRENT_ACCOUNT}" ]]; then
  echo "ERROR: unable to determine AWS account. Configure AWS credentials first."
  exit 1
fi

if [[ -n "${EXPECTED_ACCOUNT_ID}" && "${CURRENT_ACCOUNT}" != "${EXPECTED_ACCOUNT_ID}" ]]; then
  echo "ERROR: AWS caller identity is ${CURRENT_ACCOUNT}, expected ${EXPECTED_ACCOUNT_ID}."
  exit 1
fi

ZONE_ID="$(aws route53 list-hosted-zones-by-name \
  --dns-name "${DOMAIN_NAME}" \
  --query 'HostedZones[?Config.PrivateZone==`false`].Id | [0]' \
  --output text 2>/dev/null || true)"

if [[ -z "${ZONE_ID}" || "${ZONE_ID}" == "None" ]]; then
  echo "ERROR: no public Route 53 hosted zone found for ${DOMAIN_NAME}."
  exit 1
fi

ZONE_ID="${ZONE_ID#/hostedzone/}"

if [[ "${1:-}" == "--print-zone-id" ]]; then
  echo "${ZONE_ID}"
  exit 0
fi

echo "Route 53 hosted zone ready"
echo "  Domain: ${DOMAIN_NAME}"
echo "  Zone:   ${ZONE_ID}"
echo "  DNS targets:"
for target in "${TARGET_STAGES[@]}"; do
  echo "    - ${target}"
done
