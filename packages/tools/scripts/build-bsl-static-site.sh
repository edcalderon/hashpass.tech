#!/usr/bin/env bash
set -euo pipefail

# Hybrid BSL deploy (used by BOTH prod and dev as of 2026-07-29): builds the
# static export with the same domain/env config SST's bsl-web StaticSite
# used (packages/infra/src/domains.ts), then uploads it straight to a plain
# target-account S3 bucket -- no SST/Pulumi involved, so it never touches
# CreateDistribution (blocked in the target account, see
# .agents/active/task-aws-account-migration.md). The existing SOURCE-account
# CloudFront distribution and its ACM cert are untouched; only the origin
# was repointed away from SST's placeholder.sst.dev to this bucket's S3
# website endpoint. No CloudFront invalidation happens here (see below).
#
# TARGET_STAGE (sst stage name: "production" or "dev") and SITE_BUCKET_NAME
# must be set by the CodePipeline action's BuildEnvironmentJson.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PNPM_STORE_DIR="${PNPM_STORE_DIR:-.pnpm-store}"
OUTPUT_DIRECTORY="${OUTPUT_DIRECTORY:-dist-bsl-deploy-marker}"

cd "${ROOT_DIR}"

if [ -z "${TARGET_STAGE:-}" ]; then
  echo "TARGET_STAGE is required (production or dev)" >&2
  exit 1
fi

if [ -z "${SITE_BUCKET_NAME:-}" ]; then
  echo "SITE_BUCKET_NAME is required" >&2
  exit 1
fi

case "${TARGET_STAGE}" in
  production) BSL_STAGE="production" ;;
  dev) BSL_STAGE="dev" ;;
  *)
    echo "TARGET_STAGE must be exactly 'production' or 'dev', got '${TARGET_STAGE}'" >&2
    exit 1
    ;;
esac

echo "Building BSL static site (hybrid: target S3 + source CloudFront)"
echo "  Root dir:      ${ROOT_DIR}"
echo "  BSL stage:     ${BSL_STAGE}"
echo "  Site bucket:   ${SITE_BUCKET_NAME}"

# Each pipeline job runs in a fresh workspace directory. Metro's cache
# defaults to a persistent, non-workspace-scoped location on this worker, so
# without pinning it here a stale cache entry from an OLDER job's absolute
# path can get reused and break module resolution with a confusing
# "Unable to resolve module .../job-<old-uuid>/..." error -- see
# CLAUDE.md's "Metro cache on the EC2 runner is persistent" note (same class
# of bug, different worker) and build-static-site.sh, which already does
# this for the main site.
export METRO_CACHE_DIR="${METRO_CACHE_DIR:-${ROOT_DIR}/apps/mobile-app/.expo/metro-cache}"
rm -rf "${METRO_CACHE_DIR}"

rm -rf node_modules

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

# Resolve BSL's per-stage EXPO_PUBLIC_* env (packages/infra/src/domains.ts) so
# this build matches what the old SST-managed site used to set.
BSL_ENV_JSON="$(node --experimental-strip-types -e "
import('./packages/infra/src/domains.ts').then((m) => {
  const config = m.getBslSiteConfig('${BSL_STAGE}');
  process.stdout.write(JSON.stringify(config.environment));
});
")"

eval "$(node -e "
const env = ${BSL_ENV_JSON};
for (const [key, value] of Object.entries(env)) {
  process.stdout.write(\`export \${key}=\${JSON.stringify(String(value))}\n\`);
}
")"

# CODEBUILD_RESOLVED_SOURCE_VERSION is the actual commit this CodeBuild job
# checked out and is about to build -- the artifact that's really getting
# deployed, unlike git-info.json (written on develop before the release
# commit even exists). expo export inlines EXPO_PUBLIC_* at build time, so
# this bakes the true deployed commit into the bundle. Falls back to the
# local HEAD for non-CodeBuild (manual) runs. Same fix as build-static-site.sh
# uses for the main site -- see CDN_CACHE_BUSTING_HPV.md and
# version-drawer-git-commit-staleness.md.
export EXPO_PUBLIC_RELEASE_COMMIT="${CODEBUILD_RESOLVED_SOURCE_VERSION:-$(git rev-parse HEAD 2>/dev/null || echo '')}"
echo "  Release commit: ${EXPO_PUBLIC_RELEASE_COMMIT:-<unknown>}"

cd apps/mobile-app
export CI=1
SKIP_ENV_PROPAGATE=1 BUILD_ENV="${BSL_STAGE}" npm run build:static
cd "${ROOT_DIR}"

# No CloudFront invalidation here: bsl-dev.hashpass.tech's distribution
# lives in the SOURCE account, but this worker only has target-account
# credentials, so deploy-static-site.sh's list-distributions/invalidation
# lookup can't resolve it ("unable to resolve a CloudFront distribution for
# alias bsl-dev.hashpass.tech" -- confirmed 2026-07-28). HTML/manifest
# assets already get no-cache headers below, so staleness is bounded to
# CloudFront's own TTL for those objects. Revisit with a real cross-account
# invalidation path (e.g. an assumed role) once this hybrid is proven out.
SITE_BUILD_DIR="apps/mobile-app/dist" \
SITE_BUCKET_NAME="${SITE_BUCKET_NAME}" \
SITE_SKIP_API_VERSION_VERIFY=true \
  bash packages/tools/scripts/deploy-static-site.sh

mkdir -p "${OUTPUT_DIRECTORY}"
printf 'BSL static site deploy completed for stage %s at %s\n' "${BSL_STAGE}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${OUTPUT_DIRECTORY}/marker.txt"
