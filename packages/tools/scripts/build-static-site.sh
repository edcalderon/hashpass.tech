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
export METRO_CACHE_DIR="${METRO_CACHE_DIR:-${ROOT_DIR}/apps/mobile-app/.expo/metro-cache}"

# CODEBUILD_RESOLVED_SOURCE_VERSION is the actual commit this CodeBuild job
# checked out and is about to build — the artifact that's really getting
# deployed, unlike git-info.json (written on develop before the release
# commit even exists). expo export inlines EXPO_PUBLIC_* at build time, so
# this bakes the true deployed commit into the bundle. Falls back to the
# local HEAD for non-CodeBuild (manual) runs of this script.
export EXPO_PUBLIC_RELEASE_COMMIT="${CODEBUILD_RESOLVED_SOURCE_VERSION:-$(git rev-parse HEAD 2>/dev/null || echo '')}"
echo "  Release commit:  ${EXPO_PUBLIC_RELEASE_COMMIT:-<unknown>}"

rm -rf node_modules dist apps/mobile-app/.expo apps/mobile-app/.metro

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
