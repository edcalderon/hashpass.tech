#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

LAMBDA_FUNCTION_NAME="${SITE_LAMBDA_FUNCTION_NAME:-${API_LAMBDA_FUNCTION_NAME:-}}"
LAMBDA_REGION="${SITE_LAMBDA_REGION:-${API_LAMBDA_REGION:-us-east-1}}"
LAMBDA_ZIP_PATH="${SITE_LAMBDA_ZIP_PATH:-lambda-deployment.zip}"
API_VERSION_URL="${SITE_API_VERSION_URL:-${API_VERSION_URL:-}}"
API_EXPECTED_VERSION="${SITE_EXPECTED_VERSION:-${API_EXPECTED_VERSION:-}}"
API_VERSION_VERIFY_RETRIES="${SITE_API_VERSION_VERIFY_RETRIES:-${API_VERSION_VERIFY_RETRIES:-12}}"
API_VERSION_VERIFY_SLEEP_SECONDS="${SITE_API_VERSION_VERIFY_SLEEP_SECONDS:-${API_VERSION_VERIFY_SLEEP_SECONDS:-10}}"
API_VERSION_VERIFY_TIMEOUT_MS="${SITE_API_VERSION_VERIFY_TIMEOUT_MS:-${API_VERSION_VERIFY_TIMEOUT_MS:-15000}}"

read_expected_api_version() {
  if [[ -n "${API_EXPECTED_VERSION}" ]]; then
    printf '%s\n' "${API_EXPECTED_VERSION}"
    return 0
  fi

  node -e "process.stdout.write(require('${PROJECT_ROOT}/package.json').version || '')"
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
    body.versionInfo?.backendVersion,
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

if [[ -z "${LAMBDA_FUNCTION_NAME}" ]]; then
  echo "ERROR: SITE_LAMBDA_FUNCTION_NAME or API_LAMBDA_FUNCTION_NAME is required." >&2
  exit 1
fi

if [[ -z "${LAMBDA_REGION}" ]]; then
  echo "ERROR: SITE_LAMBDA_REGION or API_LAMBDA_REGION is required." >&2
  exit 1
fi

if [[ -z "${API_VERSION_URL}" ]]; then
  echo "ERROR: SITE_API_VERSION_URL or API_VERSION_URL is required." >&2
  exit 1
fi

expected_version="$(read_expected_api_version)"
if [[ -z "${expected_version}" ]]; then
  echo "ERROR: unable to determine expected API version." >&2
  exit 1
fi

echo "Deploying API Lambda"
echo "  Function: ${LAMBDA_FUNCTION_NAME}"
echo "  Region:   ${LAMBDA_REGION}"
echo "  Version:  ${expected_version}"
echo "  Verify:   ${API_VERSION_URL}"

bash "${SCRIPT_DIR}/package-lambda.sh"

if [[ ! -f "${PROJECT_ROOT}/${LAMBDA_ZIP_PATH}" ]]; then
  echo "ERROR: Lambda package was not created: ${PROJECT_ROOT}/${LAMBDA_ZIP_PATH}" >&2
  exit 1
fi

aws lambda update-function-code \
  --function-name "${LAMBDA_FUNCTION_NAME}" \
  --region "${LAMBDA_REGION}" \
  --zip-file "fileb://${PROJECT_ROOT}/${LAMBDA_ZIP_PATH}" \
  >/dev/null

aws lambda wait function-updated \
  --function-name "${LAMBDA_FUNCTION_NAME}" \
  --region "${LAMBDA_REGION}"

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
  echo "ERROR: API version verification failed after ${API_VERSION_VERIFY_RETRIES} attempt(s)." >&2
  exit 1
fi

echo "API Lambda deployment completed."
