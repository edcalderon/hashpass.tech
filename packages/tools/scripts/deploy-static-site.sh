#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR="${SITE_BUILD_DIR:-dist/client}"
SITE_BUCKET_NAME="${SITE_BUCKET_NAME:-${AWS_S3_BUCKET_NAME:-}}"
CLOUDFRONT_DISTRIBUTION_ID="${SITE_CLOUDFRONT_DISTRIBUTION_ID:-${CLOUDFRONT_DISTRIBUTION_ID:-}}"
CLOUDFRONT_DOMAIN_NAME="${SITE_CLOUDFRONT_DOMAIN_NAME:-${CLOUDFRONT_DOMAIN_NAME:-}}"
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
elif [[ -n "${CLOUDFRONT_DOMAIN_NAME}" ]]; then
  echo "  CloudFront:   ${CLOUDFRONT_DOMAIN_NAME} (resolve on demand)"
fi

echo "Syncing site assets to S3..."
aws s3 sync "${BUILD_DIR}" "s3://${SITE_BUCKET_NAME}" \
  --delete \
  --cache-control "${ASSET_CACHE_CONTROL}"

resolve_cloudfront_distribution_id() {
  local domain_name="$1"

  if [[ -z "${domain_name}" ]]; then
    return 1
  fi

  aws cloudfront list-distributions --output json \
    | jq -r --arg domain "${domain_name}" '
        .DistributionList.Items[]?
        | select(((.Aliases.Items // []) | index($domain)) != null)
        | .Id
      ' \
    | head -n 1
}

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

resolved_cloudfront_distribution_id="${CLOUDFRONT_DISTRIBUTION_ID}"

if [[ -z "${resolved_cloudfront_distribution_id}" && -n "${CLOUDFRONT_DOMAIN_NAME}" ]]; then
  resolved_cloudfront_distribution_id="$(resolve_cloudfront_distribution_id "${CLOUDFRONT_DOMAIN_NAME}")"

  if [[ -z "${resolved_cloudfront_distribution_id}" ]]; then
    echo "ERROR: unable to resolve a CloudFront distribution for alias ${CLOUDFRONT_DOMAIN_NAME}" 1>&2
    exit 1
  fi

  echo "  Resolved CloudFront: ${resolved_cloudfront_distribution_id}"
fi

if [[ -n "${resolved_cloudfront_distribution_id}" ]]; then
  echo "Creating CloudFront invalidation..."
  aws cloudfront create-invalidation \
    --distribution-id "${resolved_cloudfront_distribution_id}" \
    --paths '/*' \
    >/dev/null
fi

echo "Static site deployment completed."
