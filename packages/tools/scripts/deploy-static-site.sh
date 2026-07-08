#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR="${SITE_BUILD_DIR:-dist/client}"
SITE_BUCKET_NAME="${SITE_BUCKET_NAME:-${AWS_S3_BUCKET_NAME:-}}"
CLOUDFRONT_DISTRIBUTION_ID="${SITE_CLOUDFRONT_DISTRIBUTION_ID:-${CLOUDFRONT_DISTRIBUTION_ID:-}}"
CLOUDFRONT_DOMAIN_NAME="${SITE_CLOUDFRONT_DOMAIN_NAME:-${CLOUDFRONT_DOMAIN_NAME:-}}"
ASSET_CACHE_CONTROL="${SITE_ASSET_CACHE_CONTROL:-public,max-age=31536000,immutable}"
HTML_CACHE_CONTROL="${SITE_HTML_CACHE_CONTROL:-no-cache,no-store,must-revalidate}"
LAMBDA_FUNCTION_NAME="${SITE_LAMBDA_FUNCTION_NAME:-${API_LAMBDA_FUNCTION_NAME:-}}"
LAMBDA_REGION="${SITE_LAMBDA_REGION:-${API_LAMBDA_REGION:-${AWS_REGION:-${AWS_DEFAULT_REGION:-}}}}"
LAMBDA_ZIP_PATH="${SITE_LAMBDA_ZIP_PATH:-lambda-deployment.zip}"
SKIP_LAMBDA_DEPLOY="${SITE_SKIP_LAMBDA_DEPLOY:-${API_SKIP_LAMBDA_DEPLOY:-false}}"
API_VERSION_URL="${SITE_API_VERSION_URL:-${API_VERSION_URL:-}}"
API_EXPECTED_VERSION="${SITE_EXPECTED_VERSION:-${API_EXPECTED_VERSION:-}}"
SKIP_API_VERSION_VERIFY="${SITE_SKIP_API_VERSION_VERIFY:-${API_SKIP_VERSION_VERIFY:-false}}"
API_VERSION_VERIFY_RETRIES="${SITE_API_VERSION_VERIFY_RETRIES:-${API_VERSION_VERIFY_RETRIES:-12}}"
API_VERSION_VERIFY_SLEEP_SECONDS="${SITE_API_VERSION_VERIFY_SLEEP_SECONDS:-${API_VERSION_VERIFY_SLEEP_SECONDS:-10}}"
API_VERSION_VERIFY_TIMEOUT_MS="${SITE_API_VERSION_VERIFY_TIMEOUT_MS:-${API_VERSION_VERIFY_TIMEOUT_MS:-15000}}"

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
if [[ -n "${API_VERSION_URL}" && "${SKIP_API_VERSION_VERIFY}" != "true" ]]; then
  echo "  API verify:   ${API_VERSION_URL}"
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

read_expected_api_version() {
  if [[ -n "${API_EXPECTED_VERSION}" ]]; then
    echo "${API_EXPECTED_VERSION}"
    return 0
  fi

  node -e "process.stdout.write(require('./package.json').version || '')"
}

verify_api_version_once() {
  local version_url="$1"
  local expected_version="$2"
  local timeout_ms="$3"

  node - "${version_url}" "${expected_version}" "${timeout_ms}" <<'NODE'
const [versionUrl, expectedVersion, timeoutMsRaw] = process.argv.slice(2);
const timeoutMs = Number.parseInt(timeoutMsRaw, 10) || 15000;

async function main() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(versionUrl, {
    headers: {
      accept: 'application/json',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    },
    signal: controller.signal,
  });
  const text = await response.text();
  clearTimeout(timeout);
  let body = {};

  try {
    body = text ? JSON.parse(text) : {};
  } catch (_error) {
    body = {};
  }

  const candidates = [
    response.headers.get('x-current-version'),
    body.currentVersion,
    body.version,
    body.backendVersion,
  ]
    .map((value) => (typeof value === 'string' ? value.trim().replace(/^v/, '') : ''))
    .filter(Boolean);

  const expected = String(expectedVersion || '').trim().replace(/^v/, '');

  if (!response.ok) {
    console.error(`API version check failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
    process.exit(1);
  }

  if (!expected) {
    console.error('API version check has no expected version.');
    process.exit(1);
  }

  if (!candidates.includes(expected)) {
    console.error(
      `API version is stale. Expected ${expected}; got ${candidates.length ? candidates.join(', ') : 'no version fields'}.`
    );
    process.exit(1);
  }

  console.log(`API version verified: ${expected}`);
}

main().catch((error) => {
  console.error(`API version check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
NODE
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

if [[ -n "${LAMBDA_FUNCTION_NAME}" && "${SKIP_LAMBDA_DEPLOY}" != "true" ]]; then
  if [[ -z "${LAMBDA_REGION}" ]]; then
    echo "ERROR: SITE_LAMBDA_REGION or API_LAMBDA_REGION is required when SITE_LAMBDA_FUNCTION_NAME is set." 1>&2
    exit 1
  fi

  echo "Packaging and deploying API Lambda"
  echo "  Function: ${LAMBDA_FUNCTION_NAME}"
  echo "  Region:   ${LAMBDA_REGION}"

  bash packages/tools/scripts/package-lambda.sh

  if [[ ! -f "${LAMBDA_ZIP_PATH}" ]]; then
    echo "ERROR: Lambda package was not created: ${LAMBDA_ZIP_PATH}" 1>&2
    exit 1
  fi

  aws lambda update-function-code \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --region "${LAMBDA_REGION}" \
    --zip-file "fileb://${LAMBDA_ZIP_PATH}" \
    >/dev/null

  aws lambda wait function-updated \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --region "${LAMBDA_REGION}"
fi

if [[ -n "${API_VERSION_URL}" && "${SKIP_API_VERSION_VERIFY}" != "true" ]]; then
  expected_version="$(read_expected_api_version)"

  if [[ -z "${expected_version}" ]]; then
    echo "ERROR: unable to determine expected API version." 1>&2
    exit 1
  fi

  echo "Verifying API Lambda version"
  echo "  URL:      ${API_VERSION_URL}"
  echo "  Expected: ${expected_version}"

  api_version_verified="false"
  for attempt in $(seq 1 "${API_VERSION_VERIFY_RETRIES}"); do
    if verify_api_version_once "${API_VERSION_URL}" "${expected_version}" "${API_VERSION_VERIFY_TIMEOUT_MS}"; then
      api_version_verified="true"
      break
    fi

    if [[ "${attempt}" == "${API_VERSION_VERIFY_RETRIES}" ]]; then
      break
    fi

    echo "API version not current yet; retrying in ${API_VERSION_VERIFY_SLEEP_SECONDS}s (${attempt}/${API_VERSION_VERIFY_RETRIES})..."
    sleep "${API_VERSION_VERIFY_SLEEP_SECONDS}"
  done

  if [[ "${api_version_verified}" != "true" ]]; then
    echo "ERROR: API version verification failed after ${API_VERSION_VERIFY_RETRIES} attempt(s)." 1>&2
    exit 1
  fi
fi

echo "Static site deployment completed."
