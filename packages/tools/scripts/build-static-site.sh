#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PNPM_STORE_DIR="${PNPM_STORE_DIR:-.pnpm-store}"

cd "${ROOT_DIR}"

echo "Building HashPass static site"
echo "  Root dir:       ${ROOT_DIR}"
echo "  PNPM store dir:  ${PNPM_STORE_DIR}"

export CI=1

rm -rf node_modules dist

PNPM_VERSION="$(node packages/tools/scripts/resolve-pnpm-version.js)"
corepack prepare "pnpm@${PNPM_VERSION}" --activate
corepack pnpm config set store-dir "${PNPM_STORE_DIR}"

corepack pnpm --version
corepack pnpm install --frozen-lockfile --prefer-offline
corepack pnpm --filter hashpass-mobile-app build
npm run postbuild:web
