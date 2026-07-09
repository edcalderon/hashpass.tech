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
API_LAMBDA_ENV_UPDATE_MAX_BYTES="${SITE_API_LAMBDA_ENV_UPDATE_MAX_BYTES:-${API_LAMBDA_ENV_UPDATE_MAX_BYTES:-3900}}"

read_expected_api_version() {
  if [[ -n "${API_EXPECTED_VERSION}" ]]; then
    printf '%s\n' "${API_EXPECTED_VERSION}"
    return 0
  fi

  node -e "process.stdout.write(require('${PROJECT_ROOT}/package.json').version || '')"
}

ensure_fresh_api_bundle() {
  local expected_version="$1"
  local version_route="${PROJECT_ROOT}/apps/mobile-app/dist/server/_expo/functions/api/config/versions+api.js"

  if [[ "${API_LAMBDA_SKIP_BUILD:-false}" == "true" ]]; then
    echo "Skipping API bundle build because API_LAMBDA_SKIP_BUILD=true."
    return 0
  fi

  if [[ -f "${version_route}" ]] && grep -Fq -- "${expected_version}" "${version_route}"; then
    echo "Using existing Expo API bundle for ${expected_version}."
    return 0
  fi

  echo "Building fresh Expo API bundle for Lambda."
  env \
    CI="${CI:-1}" \
    SKIP_ENV_PROPAGATE="${SKIP_ENV_PROPAGATE:-1}" \
    EXPO_EXPORT_MAX_WORKERS="${EXPO_EXPORT_MAX_WORKERS:-1}" \
    NODE_MAX_OLD_SPACE_SIZE="${NODE_MAX_OLD_SPACE_SIZE:-12288}" \
    npm --prefix "${PROJECT_ROOT}/apps/mobile-app" run build:static
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

sync_lambda_environment() {
  local current_config_file
  local environment_file
  local sync_status_file
  local sync_action
  current_config_file="$(mktemp /tmp/hashpass-lambda-config.XXXXXX.json)"
  environment_file="$(mktemp /tmp/hashpass-lambda-env.XXXXXX.json)"
  sync_status_file="$(mktemp /tmp/hashpass-lambda-env-status.XXXXXX.json)"

  aws lambda get-function-configuration \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --region "${LAMBDA_REGION}" \
    --output json >"${current_config_file}"

  node - "${current_config_file}" "${environment_file}" "${sync_status_file}" <<'NODE'
const fs = require('node:fs');

const [configPath, environmentPath, statusPath] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const current = { ...(config.Environment?.Variables || {}) };
const maxBytes = Number.parseInt(process.env.API_LAMBDA_ENV_UPDATE_MAX_BYTES || '3900', 10) || 3900;

const syncKeys = [
  'EXPO_PUBLIC_SUPABASE_PROFILE',
  'SUPABASE_PROFILE',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL_DEV',
  'EXPO_PUBLIC_SUPABASE_URL_PROD',
  'EXPO_PUBLIC_SUPABASE_KEY',
  'EXPO_PUBLIC_SUPABASE_KEY_DEV',
  'EXPO_PUBLIC_SUPABASE_KEY_PROD',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD',
  'EXPO_PUBLIC_SITE_URL',
  'SITE_URL',
  'FRONTEND_URL',
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_BETTER_AUTH_URL',
];

const changed = [];
for (const key of syncKeys) {
  const value = process.env[key];
  if (typeof value !== 'string' || !value.trim()) continue;

  const trimmed = value.trim();
  if (current[key] !== trimmed) {
    changed.push(key);
  }
  current[key] = trimmed;
}

const measuredBytes = Buffer.byteLength(JSON.stringify(current), 'utf8');

if (changed.length === 0) {
  fs.writeFileSync(statusPath, JSON.stringify({ action: 'noop', changed, measuredBytes, maxBytes }));
  console.log('Lambda environment already has the requested public Supabase/API keys.');
} else if (measuredBytes > maxBytes) {
  fs.writeFileSync(statusPath, JSON.stringify({ action: 'skip_size', changed, measuredBytes, maxBytes }));
  console.warn(
    `Skipping Lambda environment sync because the merged payload is ${measuredBytes} bytes, above the safe ${maxBytes} byte limit. ` +
      `Keys not synced: ${changed.join(', ')}`
  );
} else {
  fs.writeFileSync(environmentPath, JSON.stringify({ Variables: current }));
  fs.writeFileSync(statusPath, JSON.stringify({ action: 'update', changed, measuredBytes, maxBytes }));
  console.log(`Syncing Lambda environment keys: ${changed.join(', ')}`);
}
NODE

  sync_action="$(node -e "process.stdout.write(JSON.parse(require('node:fs').readFileSync('${sync_status_file}', 'utf8')).action)")"

  if [[ "${sync_action}" == "update" ]]; then
    aws lambda update-function-configuration \
      --function-name "${LAMBDA_FUNCTION_NAME}" \
      --region "${LAMBDA_REGION}" \
      --environment "file://${environment_file}" \
      >/dev/null

    aws lambda wait function-updated \
      --function-name "${LAMBDA_FUNCTION_NAME}" \
      --region "${LAMBDA_REGION}"
  fi

  rm -f "${current_config_file}" "${environment_file}" "${sync_status_file}"
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

ensure_fresh_api_bundle "${expected_version}"
bash "${SCRIPT_DIR}/package-lambda.sh"

if [[ ! -f "${PROJECT_ROOT}/${LAMBDA_ZIP_PATH}" ]]; then
  echo "ERROR: Lambda package was not created: ${PROJECT_ROOT}/${LAMBDA_ZIP_PATH}" >&2
  exit 1
fi

sync_lambda_environment

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
