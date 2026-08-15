#!/bin/bash
# Packages the HashPass Links API Lambda handler for deployment.
#
# Unlike package-lambda.sh (the Expo Router API's packaging script), this
# service is bundled with esbuild into a single-file CJS output that already
# inlines its own dependencies (see packages/hashpass-links-api/package.json's
# build:lambda script) -- so packaging here is just "build, then zip the one
# output file," no node_modules install step needed.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
SERVICE_DIR="$PROJECT_ROOT/packages/hashpass-links-api"
OUTPUT_ZIP="$PROJECT_ROOT/hashpass-links-api-lambda.zip"

echo "Building HashPass Links API Lambda bundle..."
pnpm --filter @hashpass/hashpass-links-api run build:lambda

if [ ! -f "$SERVICE_DIR/dist-lambda/index.js" ]; then
  echo "Build output missing: $SERVICE_DIR/dist-lambda/index.js"
  exit 1
fi

echo "Creating deployment zip..."
rm -f "$OUTPUT_ZIP"
(cd "$SERVICE_DIR/dist-lambda" && zip -r "$OUTPUT_ZIP" index.js > /dev/null)

echo "Created $(basename "$OUTPUT_ZIP")"
