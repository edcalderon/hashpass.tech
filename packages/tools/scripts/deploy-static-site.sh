#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR="${SITE_BUILD_DIR:-dist/client}"
SITE_BUCKET_NAME="${SITE_BUCKET_NAME:-${AWS_S3_BUCKET_NAME:-}}"
CLOUDFRONT_DISTRIBUTION_ID="${SITE_CLOUDFRONT_DISTRIBUTION_ID:-${CLOUDFRONT_DISTRIBUTION_ID:-}}"
ASSET_CACHE_CONTROL="${SITE_ASSET_CACHE_CONTROL:-public,max-age=31536000,immutable}"
HTML_CACHE_CONTROL="${SITE_HTML_CACHE_CONTROL:-no-cache,no-store,must-revalidate}"

if [[ -z "${SITE_BUCKET_NAME}" ]]; then
  echo "ERROR: SITE_BUCKET_NAME (or AWS_S3_BUCKET_NAME) is required." 1>&2
  exit 1
fi

if [[ ! -d "${BUILD_DIR}" ]]; then
  echo "ERROR: build directory not found: ${BUILD_DIR}" 1>&2
  exit 1
fi

echo "Deploying static site"
echo "  Build dir:    ${BUILD_DIR}"
echo "  S3 bucket:    ${SITE_BUCKET_NAME}"
if [[ -n "${CLOUDFRONT_DISTRIBUTION_ID}" ]]; then
  echo "  CloudFront:   ${CLOUDFRONT_DISTRIBUTION_ID}"
fi

echo "Syncing site assets to S3..."
aws s3 sync "${BUILD_DIR}" "s3://${SITE_BUCKET_NAME}" \
  --delete \
  --cache-control "${ASSET_CACHE_CONTROL}"

echo "Refreshing HTML and manifest assets with no-cache headers..."
while IFS= read -r -d '' file; do
  key="${file#${BUILD_DIR}/}"
  aws s3 cp "${file}" "s3://${SITE_BUCKET_NAME}/${key}" \
    --cache-control "${HTML_CACHE_CONTROL}" \
    >/dev/null
done < <(
  find "${BUILD_DIR}" -type f \
    \( -name '*.html' -o -name '*.json' -o -name 'sw.js' -o -name '*.txt' -o -name '*.xml' \) \
    -print0
)

if [[ -n "${CLOUDFRONT_DISTRIBUTION_ID}" ]]; then
  echo "Creating CloudFront invalidation..."
  aws cloudfront create-invalidation \
    --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
    --paths '/*' \
    >/dev/null
fi

echo "Static site deployment completed."
