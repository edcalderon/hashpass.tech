#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-production}"
BUMP="${2:-patch}"

echo "Testing infra release flow"
echo "  Environment: ${ENVIRONMENT}"
echo "  Bump:        ${BUMP}"
echo ""

node packages/tools/scripts/release-infra-pipeline.js --env "${ENVIRONMENT}" --bump "${BUMP}" --dry-run --skip-deploy
