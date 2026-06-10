#!/usr/bin/env bash
set -euo pipefail

EXPECTED_ACCOUNT_ID="${EXPECTED_AWS_ACCOUNT_ID:-${AWS_ACCOUNT_ID:-}}"
REGION="${AWS_REGION:-us-east-2}"
RESOURCE_PREFIX="${RESOURCE_PREFIX:-bsl-hashpass}"
CONNECTION_NAME="${CONNECTION_NAME:-${RESOURCE_PREFIX}-github-${REGION}}"
PROVIDER_TYPE="${PROVIDER_TYPE:-GitHub}"
REPO="${1:-${GITHUB_REPOSITORY:-}}"

if [[ -z "${REPO}" ]]; then
  echo "ERROR: set GITHUB_REPOSITORY or pass <owner>/<repo> as the first argument."
  exit 1
fi

echo "Provisioning AWS CodeConnections connection"
echo "  Region:          ${REGION}"
echo "  Prefix:          ${RESOURCE_PREFIX}"
echo "  Connection name: ${CONNECTION_NAME}"
echo "  Provider:        ${PROVIDER_TYPE}"
echo "  Repository:      ${REPO}"

CURRENT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [[ -z "${CURRENT_ACCOUNT}" ]]; then
  echo "ERROR: unable to determine AWS account. Configure AWS credentials first."
  exit 1
fi

if [[ -n "${EXPECTED_ACCOUNT_ID}" && "${CURRENT_ACCOUNT}" != "${EXPECTED_ACCOUNT_ID}" ]]; then
  echo "ERROR: AWS caller identity is ${CURRENT_ACCOUNT}, expected ${EXPECTED_ACCOUNT_ID}."
  exit 1
fi

if aws codeconnections list-connections --region "${REGION}" --query "Connections[?ConnectionName=='${CONNECTION_NAME}'].ConnectionArn" --output text 2>/dev/null | grep -q 'arn:aws'; then
  echo "Connection already exists."
  CONNECTION_ARN="$(aws codeconnections list-connections --region "${REGION}" --query "Connections[?ConnectionName=='${CONNECTION_NAME}'].ConnectionArn | [0]" --output text)"
else
  CONNECTION_ARN="$(aws codeconnections create-connection --region "${REGION}" --provider-type "${PROVIDER_TYPE}" --connection-name "${CONNECTION_NAME}" --query 'ConnectionArn' --output text)"
fi

echo ""
echo "Connection ARN: ${CONNECTION_ARN}"
echo ""
echo "Next steps:"
echo "  1. Open the AWS Console and complete the GitHub handshake for the connection."
echo "  2. Use the ARN above in any CodePipeline or CodeBuild source action."
echo "  3. Run the infra release dry-run: pnpm run release:infra -- --dry-run"
