#!/usr/bin/env bash
set -euo pipefail

# Hybrid BSL deploy: builds the static export with the same domain/env config
# SST's bsl-web StaticSite used (packages/infra/src/domains.ts), then uploads
# it straight to a plain target-account S3 bucket and invalidates the
# existing SOURCE-account CloudFront distribution -- no SST/Pulumi involved,
# so it never touches CreateDistribution (blocked in the target account,
# see .agents/active/task-aws-account-migration.md). The distribution and
# its ACM cert already exist in the source account; only the origin was
# repointed away from SST's placeholder.sst.dev to this bucket's S3 website
# endpoint.
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

BSL_STAGE="production"
if [ "${TARGET_STAGE}" != "production" ]; then
  BSL_STAGE="dev"
fi

echo "Building BSL static site (hybrid: target S3 + source CloudFront)"
echo "  Root dir:      ${ROOT_DIR}"
echo "  BSL stage:     ${BSL_STAGE}"
echo "  Site bucket:   ${SITE_BUCKET_NAME}"

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

cd apps/mobile-app
export CI=1
SKIP_ENV_PROPAGATE=1 BUILD_ENV="${BSL_STAGE}" npm run build:static
cd "${ROOT_DIR}"

SITE_BUILD_DIR="apps/mobile-app/dist" \
SITE_BUCKET_NAME="${SITE_BUCKET_NAME}" \
SITE_CLOUDFRONT_DOMAIN_NAME="${BSL_CLOUDFRONT_DOMAIN_NAME:-}" \
SITE_SKIP_API_VERSION_VERIFY=true \
  bash packages/tools/scripts/deploy-static-site.sh

mkdir -p "${OUTPUT_DIRECTORY}"
printf 'BSL static site deploy completed for stage %s at %s\n' "${BSL_STAGE}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${OUTPUT_DIRECTORY}/marker.txt"
