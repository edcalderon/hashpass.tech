#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PNPM_STORE_DIR="${PNPM_STORE_DIR:-.pnpm-store}"

cd "${ROOT_DIR}"

echo "Building HashPass static site"
echo "  Root dir:       ${ROOT_DIR}"
echo "  PNPM store dir:  ${PNPM_STORE_DIR}"

export CI=1
export NODE_MAX_OLD_SPACE_SIZE="${NODE_MAX_OLD_SPACE_SIZE:-3072}"
export EXPO_EXPORT_MAX_WORKERS="${EXPO_EXPORT_MAX_WORKERS:-1}"

rm -rf node_modules dist

PNPM_VERSION="$(
  node <<'NODE'
const fs = require('fs');
const path = require('path');

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const packageManager = String(packageJson.packageManager || '').trim();
const match = packageManager.match(/^pnpm@(.+)$/);

if (!match) {
  throw new Error(`Expected packageManager to be set to pnpm@<version> in ${packageJsonPath}`);
}

process.stdout.write(`${match[1]}\n`);
NODE
)"
corepack prepare "pnpm@${PNPM_VERSION}" --activate
corepack pnpm config set store-dir "${PNPM_STORE_DIR}"

corepack pnpm --version
corepack pnpm install --frozen-lockfile --prefer-offline
corepack pnpm --filter hashpass-mobile-app build
npm run postbuild:web
