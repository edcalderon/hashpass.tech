#!/usr/bin/env bash
set -euo pipefail

# Runs on the BSL EC2 pipeline worker (packages/infra/terraform/stacks/bsl-target),
# invoked as the custom CodePipeline action's BuildScript. Unlike
# build-static-site.sh, this script's single command IS the full deploy --
# `pnpm --filter @hashpass/infra run deploy:<stage>` runs SST, which creates
# and updates its own S3/CloudFront/Route53 resources directly. There is no
# separate DeployScript or CodePipeline Deploy stage: SST's deploy is
# atomic and doesn't produce a "build output" to hand off afterward.
#
# TARGET_STAGE (sst stage name: "production" or "dev") must be set by the
# CodePipeline action's BuildEnvironmentJson. OUTPUT_DIRECTORY is only
# created because the shared EC2 worker script (aws_pipeline_ec2_worker
# module) always zips and uploads whatever OutputDirectory is configured as
# the action's output artifact -- it's an empty marker directory, not a
# real build artifact.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PNPM_STORE_DIR="${PNPM_STORE_DIR:-.pnpm-store}"
OUTPUT_DIRECTORY="${OUTPUT_DIRECTORY:-dist-bsl-deploy-marker}"

cd "${ROOT_DIR}"

if [ -z "${TARGET_STAGE:-}" ]; then
  echo "TARGET_STAGE is required (production or dev)" >&2
  exit 1
fi

echo "Deploying BSL infra"
echo "  Root dir:      ${ROOT_DIR}"
echo "  Target stage:  ${TARGET_STAGE}"
echo "  PNPM store dir: ${PNPM_STORE_DIR}"

export CI=1
export ROUTE53_ZONE_ID="$(bash packages/tools/scripts/check-infra-dns.sh --print-zone-id)"

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

corepack pnpm --filter @hashpass/infra run "deploy:${TARGET_STAGE}"

mkdir -p "${OUTPUT_DIRECTORY}"
printf 'BSL infra deploy completed for stage %s at %s\n' "${TARGET_STAGE}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${OUTPUT_DIRECTORY}/marker.txt"
