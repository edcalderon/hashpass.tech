#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
SERVICE_DIR="${PROJECT_ROOT}/packages/notion-plane-sync"
OUTPUT_ZIP="${PROJECT_ROOT}/notion-archive-lambda.zip"

pnpm --dir "${PROJECT_ROOT}" --filter @hashpass/notion-plane-sync run build:lambda
rm -f "${OUTPUT_ZIP}"
(cd "${SERVICE_DIR}/dist-lambda" && zip -q -r "${OUTPUT_ZIP}" index.mjs)

echo "Created ${OUTPUT_ZIP}"
