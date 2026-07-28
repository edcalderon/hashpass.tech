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
# Fresh workspace per job, but Metro's cache defaults to a persistent,
# non-workspace-scoped location on this worker -- without pinning this, a
# stale cache entry from an OLDER job's absolute path can get reused and
# break module resolution (confirmed 2026-07-28, same class of bug as
# CLAUDE.md's "Metro cache on the EC2 runner is persistent" note for the
# mobile-release runner, just on this worker instead).
export METRO_CACHE_DIR="${METRO_CACHE_DIR:-${ROOT_DIR}/apps/mobile-app/.expo/metro-cache}"
rm -rf "${METRO_CACHE_DIR}"
export ROUTE53_ZONE_ID="$(bash packages/tools/scripts/check-infra-dns.sh --print-zone-id)"

# check-infra-dns.sh resolves whatever hashpass.tech zone is visible under the
# CURRENT credentials -- which on this worker is always the target account's
# own (non-authoritative) shadow copy of the zone, never the real
# authoritative zone in the source account (058264267235; hosted zones stay
# there indefinitely by design, see aws-account-cutover.md). SST writes the
# ACM DNS validation CNAME into whatever zone ROUTE53_ZONE_ID points at, so
# for a domain this stack has never deployed before, the certificate will sit
# PENDING_VALIDATION forever (with the SST deploy hanging silently, near-zero
# CPU, waiting on it) until someone manually copies that validation CNAME
# into the real source-account zone -- there is no cross-account Route53
# role to automate this yet. Confirmed 2026-07-28 for bsl-dev.hashpass.tech.
# Once a domain's cert is ISSUED this is a one-time cost; it won't recur on
# later deploys of the same stage/domain.

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
