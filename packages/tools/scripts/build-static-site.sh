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
export EXPO_EXPORT_MAX_WORKERS="${EXPO_EXPORT_MAX_WORKERS:-4}"
export METRO_CACHE_DIR="${METRO_CACHE_DIR:-${ROOT_DIR}/apps/mobile-app/.expo/metro-cache}"

# hashpass-web's pipelines run this via the same custom EC2 worker action as
# BSL (aws_pipeline_ec2_worker), not real AWS CodeBuild -- there is no
# CODEBUILD_RESOLVED_SOURCE_VERSION here, and the source artifact is a
# CODE_ZIP with no .git directory, so the git-rev-parse fallback silently
# resolves to empty on an actual pipeline run. build-worker-user-data.sh.tftpl
# exports EXPO_PUBLIC_RELEASE_COMMIT from the CodePipeline job's
# inputArtifacts[0].revision (the CodeStarSourceConnection-resolved commit)
# before invoking this script, so prefer that first. CODEBUILD_RESOLVED_SOURCE_VERSION
# and local HEAD remain as fallbacks for a real CodeBuild path or manual runs.
# expo export inlines EXPO_PUBLIC_* at build time, so this bakes the true
# deployed commit into the bundle instead of git-info.json's stale,
# pre-release-commit value -- see CDN_CACHE_BUSTING_HPV.md and
# version-drawer-git-commit-staleness.md.
export EXPO_PUBLIC_RELEASE_COMMIT="${EXPO_PUBLIC_RELEASE_COMMIT:-${CODEBUILD_RESOLVED_SOURCE_VERSION:-$(git rev-parse HEAD 2>/dev/null || echo '')}}"
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
