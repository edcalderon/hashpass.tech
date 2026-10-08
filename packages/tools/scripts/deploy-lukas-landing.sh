#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR="${LUKAS_BUILD_DIR:-}"
BUCKET_NAME="${LUKAS_SITE_BUCKET:-hashpass-lukas-landing-site}"
SITE_URL="${LUKAS_SITE_URL:-https://lukas.hashpass.tech}"
EXPECTED_VERSION="${LUKAS_RELEASE_VERSION:-}"
AWS_REGION="${AWS_REGION:-us-east-2}"

if [[ -z "${BUILD_DIR}" || ! -d "${BUILD_DIR}" ]]; then
  echo "ERROR: LUKAS_BUILD_DIR must point to an existing static export." >&2
  exit 1
fi

if [[ -z "${EXPECTED_VERSION}" ]]; then
  echo "ERROR: LUKAS_RELEASE_VERSION is required." >&2
  exit 1
fi

MANIFEST="${BUILD_DIR}/recovery.json"
if [[ ! -f "${MANIFEST}" ]]; then
  echo "ERROR: Lukas export is missing recovery.json." >&2
  exit 1
fi

manifest_version="$(node - "${MANIFEST}" <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(String(manifest.releaseVersion || ''));
NODE
)"

if [[ "${manifest_version}" != "${EXPECTED_VERSION}" ]]; then
  echo "ERROR: Lukas artifact version ${manifest_version:-<missing>} does not match release ${EXPECTED_VERSION}." >&2
  exit 1
fi

echo "Publishing Lukas landing v${EXPECTED_VERSION}"
echo "  Build:  ${BUILD_DIR}"
echo "  Bucket: s3://${BUCKET_NAME}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

aws s3 sync "${BUILD_DIR}" "s3://${BUCKET_NAME}" \
  --region "${AWS_REGION}" \
  --delete \
  --cache-control 'public,max-age=300' \
  --only-show-errors

distribution_id="${LUKAS_SITE_DISTRIBUTION_ID:-}"
if [[ -z "${distribution_id}" ]]; then
  aws cloudfront list-distributions --output json > "${tmp_dir}/distributions.json"
  distribution_id="$(node -e "const fs = require('node:fs'); const domain = new URL(process.argv[1]).hostname; const distributions = JSON.parse(fs.readFileSync(0, 'utf8')).DistributionList?.Items || []; const match = distributions.find((distribution) => (distribution.Aliases?.Items || []).includes(domain)); if (match?.Id) process.stdout.write(match.Id);" "${SITE_URL}" < "${tmp_dir}/distributions.json")"
fi

if [[ -z "${distribution_id}" ]]; then
  echo "ERROR: Could not resolve the CloudFront distribution for ${SITE_URL}." >&2
  exit 1
fi

echo "  CloudFront: ${distribution_id}"
aws cloudfront create-invalidation \
  --distribution-id "${distribution_id}" \
  --paths '/*' \
  >/dev/null

verify_manifest() {
  local manifest_file="$1"
  node - "${manifest_file}" "${EXPECTED_VERSION}" <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = process.argv[3];
if (manifest.releaseVersion !== expected) {
  throw new Error(`Expected releaseVersion ${expected}, received ${manifest.releaseVersion || '<missing>'}`);
}
NODE
}

verified="false"
for attempt in $(seq 1 12); do
  if curl --fail --silent --show-error --location \
      -H 'cache-control: no-cache' \
      "${SITE_URL%/}/recovery.json?release=${EXPECTED_VERSION}" \
      -o "${tmp_dir}/recovery.json" \
      && verify_manifest "${tmp_dir}/recovery.json" \
      && curl --fail --silent --show-error --location \
        "${SITE_URL%/}/favicon.svg?release=${EXPECTED_VERSION}" \
        -o /dev/null \
      && curl --fail --silent --show-error --location \
        "${SITE_URL%/}/lukas?release=${EXPECTED_VERSION}" \
        -o "${tmp_dir}/lukas.html" \
      && grep -q 'favicon.svg' "${tmp_dir}/lukas.html"; then
    verified="true"
    break
  fi

  if [[ "${attempt}" != 12 ]]; then
    echo "Live Lukas artifact is not current yet; retrying in 10s (${attempt}/12)..."
    sleep 10
  fi
done

if [[ "${verified}" != "true" ]]; then
  echo "ERROR: Live Lukas page did not expose release ${EXPECTED_VERSION} after invalidation." >&2
  exit 1
fi

echo "Lukas landing v${EXPECTED_VERSION} is live at ${SITE_URL}."
