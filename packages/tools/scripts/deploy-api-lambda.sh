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
# This same script runs concurrently from two independent deploy paths on
# every push to main -- the GH Actions infra-deploy.yml workflow (the
# "release safety net") and the target web CodePipeline's own CodeBuild job
# -- both updating the SAME Lambda function around the same time by design
# (see DEPLOYMENT_MAP.md). AWS rejects a second in-flight
# UpdateFunctionCode/UpdateFunctionConfiguration on one function with
# ResourceConflictException; this isn't hypothetical -- confirmed in
# production 2026-08-17 (v1.9.11): the CodePipeline attempt failed outright
# a few seconds after the GH Actions attempt won the race and succeeded.
# AWS documents this as the transient/retryable case, so retry with a short
# fixed backoff instead of failing an otherwise-successful deploy over a
# lock a concurrent, equally-valid deploy already holds.
LAMBDA_UPDATE_MAX_ATTEMPTS="${LAMBDA_UPDATE_MAX_ATTEMPTS:-6}"
LAMBDA_UPDATE_RETRY_DELAY_SECONDS="${LAMBDA_UPDATE_RETRY_DELAY_SECONDS:-5}"

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

# Reads the CURRENTLY live version from API_VERSION_URL, or prints nothing
# on any failure (unreachable, malformed body, etc.) -- a hiccup here must
# never block a legitimate deploy, only skip the staleness check that uses
# it. Deliberately a plain read, unlike verify_api_version_once, which
# asserts a match and exits non-zero.
read_live_api_version() {
  local version_url="$1"
  node -e '
    const versionUrl = process.argv[1];
    (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(versionUrl, {
          headers: { accept: "application/json", "cache-control": "no-cache", pragma: "no-cache" },
          signal: controller.signal,
        });
        const text = await response.text();
        let body = {};
        try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
        const current = [
          response.headers.get("x-current-version"),
          body.currentVersion,
          body.version,
          body.backendVersion,
          body.versionInfo?.backendVersion,
        ]
          .map((value) => (typeof value === "string" ? value.trim().replace(/^v/, "") : ""))
          .find(Boolean);
        if (current) process.stdout.write(current);
      } catch {
        // Swallow -- see function comment.
      } finally {
        clearTimeout(timeout);
      }
    })();
  ' "${version_url}"
}

# True (exit 0) if semver $1 >= semver $2, comparing X.Y.Z numerically
# (missing components treated as 0). Used to decide whether a currently-live
# version already supersedes what this run is about to deploy.
version_gte() {
  node -e '
    const parse = (v) => String(v).replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
    const [a, b] = [parse(process.argv[1]), parse(process.argv[2])];
    for (let i = 0; i < 3; i++) {
      if ((a[i] || 0) > (b[i] || 0)) process.exit(0);
      if ((a[i] || 0) < (b[i] || 0)) process.exit(1);
    }
    process.exit(0);
  ' "$1" "$2"
}

sync_lambda_environment() {
  local current_config_file
  local environment_file
  local sync_status_file
  local aws_error_file
  local sync_action
  local update_status
  current_config_file="$(mktemp /tmp/hashpass-lambda-config.XXXXXX.json)"
  environment_file="$(mktemp /tmp/hashpass-lambda-env.XXXXXX.json)"
  sync_status_file="$(mktemp /tmp/hashpass-lambda-env-status.XXXXXX.json)"
  aws_error_file="$(mktemp /tmp/hashpass-lambda-env-aws-error.XXXXXX.log)"

  cleanup_lambda_environment_files() {
    rm -f "${current_config_file}" "${environment_file}" "${sync_status_file}" "${aws_error_file}"
    trap - RETURN
  }
  trap cleanup_lambda_environment_files RETURN

  # Fetches the CURRENT live config and rebuilds the merged environment
  # payload from it, setting sync_action as a side effect. Called once
  # before the first update attempt and again before every retry -- a
  # retry must never resubmit a stale pre-conflict snapshot, since a
  # competing deploy (the other of the two paths that run this same
  # script concurrently -- see the LAMBDA_UPDATE_MAX_ATTEMPTS comment
  # above) could have changed env vars itself (e.g. a rotated service-role
  # key) in the window between our first attempt and the retry; blindly
  # resubmitting the old snapshot would silently revert that change.
  refresh_lambda_environment_payload() {
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
  'EXPO_PUBLIC_BSL_SUPABASE_URL_PROD',
  'EXPO_PUBLIC_BSL_SUPABASE_URL_DEV',
  'EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD',
  'EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV',
  // Core's own service-role key -- was missing from this list entirely
  // until 2026-08-07, meaning no deploy ever touched it since the Lambda
  // was first configured. Confirmed live: it held BSL's key (wrong
  // project) the whole time, undetected because nothing ever re-synced
  // it to catch the drift. See supabase-project-map.md for the incident.
  'SUPABASE_SERVICE_ROLE_KEY',
  'BSL_SUPABASE_SERVICE_ROLE_KEY',
  'BSL_SUPABASE_SERVICE_ROLE_KEY_PROD',
  'BSL_SUPABASE_SERVICE_ROLE_KEY_DEV',
  'EXPO_PUBLIC_SITE_URL',
  'SITE_URL',
  'FRONTEND_URL',
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_BETTER_AUTH_URL',
  'SENTRY_DSN',
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

    if [[ "${sync_action}" == "update" && "${GITHUB_ACTIONS:-}" == "true" ]]; then
      node - "${environment_file}" <<'NODE'
const fs = require('node:fs');

const [environmentPath] = process.argv.slice(2);
const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const values = new Set(Object.values(environment.Variables || {}));

function escapeWorkflowCommandValue(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

for (const value of [...values].filter((item) => typeof item === 'string' && item.length >= 4)) {
  console.log(`::add-mask::${escapeWorkflowCommandValue(value)}`);
}
NODE
    fi
  }

  refresh_lambda_environment_payload

  if [[ "${sync_action}" == "update" ]]; then
    set +e
    for env_attempt in $(seq 1 "${LAMBDA_UPDATE_MAX_ATTEMPTS}"); do
      aws lambda update-function-configuration \
        --function-name "${LAMBDA_FUNCTION_NAME}" \
        --region "${LAMBDA_REGION}" \
        --environment "file://${environment_file}" \
        >/dev/null 2>"${aws_error_file}"
      update_status=$?
      if [[ "${update_status}" -eq 0 ]]; then
        break
      fi
      # See the identical retry around update-function-code below for why
      # this specific error is retried instead of failing the deploy.
      if grep -q "ResourceConflictException" "${aws_error_file}" && [[ "${env_attempt}" -lt "${LAMBDA_UPDATE_MAX_ATTEMPTS}" ]]; then
        echo "Lambda environment update hit ResourceConflictException (another update in progress), retrying in ${LAMBDA_UPDATE_RETRY_DELAY_SECONDS}s (attempt ${env_attempt}/${LAMBDA_UPDATE_MAX_ATTEMPTS})..." >&2
        sleep "${LAMBDA_UPDATE_RETRY_DELAY_SECONDS}"
        # Re-fetch + rebuild from the NOW-current config before retrying --
        # see refresh_lambda_environment_payload's comment.
        refresh_lambda_environment_payload
        if [[ "${sync_action}" != "update" ]]; then
          echo "Lambda environment already matches after refresh (a concurrent deploy applied the same values); nothing left to sync." >&2
          update_status=0
          break
        fi
        continue
      fi
      break
    done
    set -e

    if [[ "${update_status}" -ne 0 ]]; then
      echo "ERROR: Lambda environment update failed. Redacted AWS CLI output follows:" >&2
      node - "${current_config_file}" "${environment_file}" "${aws_error_file}" <<'NODE' >&2
const fs = require('node:fs');

const [currentConfigPath, environmentPath, errorPath] = process.argv.slice(2);
const values = new Set();

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (_error) {
    return {};
  }
}

function collectValues(vars) {
  for (const value of Object.values(vars || {})) {
    if (typeof value === 'string' && value.length >= 4) {
      values.add(value);
    }
  }
}

collectValues(readJson(currentConfigPath).Environment?.Variables);
collectValues(readJson(environmentPath).Variables);

let output = fs.readFileSync(errorPath, 'utf8');
for (const value of [...values].sort((a, b) => b.length - a.length)) {
  output = output.split(value).join('[REDACTED]');
}

output = output.replace(/String measured:\s*\{.*$/gms, 'String measured: [REDACTED_ENV_PAYLOAD]');
output = output.replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)([^@\s]+)(@)/gi, '$1[REDACTED]$3');
output = output.replace(/(mongodb(?:\+srv)?:\/\/[^:\s/@]+:)([^@\s]+)(@)/gi, '$1[REDACTED]$3');

process.stderr.write(output.trim() ? `${output.trim()}\n` : 'AWS CLI returned no stderr output.\n');
NODE
      return "${update_status}"
    fi

    aws lambda wait function-updated \
      --function-name "${LAMBDA_FUNCTION_NAME}" \
      --region "${LAMBDA_REGION}"
  fi
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

code_update_error_file="$(mktemp /tmp/hashpass-lambda-code-aws-error.XXXXXX.log)"
superseded="false"
set +e
for code_attempt in $(seq 1 "${LAMBDA_UPDATE_MAX_ATTEMPTS}"); do
  # Checked before every attempt, including the first: this same script
  # runs concurrently from two deploy paths (see LAMBDA_UPDATE_MAX_ATTEMPTS
  # above), so a competing, newer run can win and complete in the window
  # before our own attempt, or during our retry backoff. Without this
  # check, an older run's retry could still succeed after the ZIP swap and
  # verify its OWN (older) expected_version against the endpoint it just
  # set, reporting green while production silently ends on the older
  # release. If the live version already matches or supersedes what we're
  # about to deploy, there is nothing left for this run to do.
  live_version="$(read_live_api_version "${API_VERSION_URL}")"
  if [[ -n "${live_version}" ]] && version_gte "${live_version}" "${expected_version}"; then
    echo "Live API version (${live_version}) already >= this deploy's target (${expected_version}) -- a newer or equal deploy already won, skipping UpdateFunctionCode rather than overwriting it with an older release." >&2
    code_update_status=0
    superseded="true"
    break
  fi

  aws lambda update-function-code \
    --function-name "${LAMBDA_FUNCTION_NAME}" \
    --region "${LAMBDA_REGION}" \
    --zip-file "fileb://${PROJECT_ROOT}/${LAMBDA_ZIP_PATH}" \
    >/dev/null 2>"${code_update_error_file}"
  code_update_status=$?
  if [[ "${code_update_status}" -eq 0 ]]; then
    break
  fi
  if grep -q "ResourceConflictException" "${code_update_error_file}" && [[ "${code_attempt}" -lt "${LAMBDA_UPDATE_MAX_ATTEMPTS}" ]]; then
    echo "UpdateFunctionCode hit ResourceConflictException (another update in progress), retrying in ${LAMBDA_UPDATE_RETRY_DELAY_SECONDS}s (attempt ${code_attempt}/${LAMBDA_UPDATE_MAX_ATTEMPTS})..." >&2
    sleep "${LAMBDA_UPDATE_RETRY_DELAY_SECONDS}"
    continue
  fi
  break
done
set -e

if [[ "${code_update_status}" -ne 0 ]]; then
  echo "ERROR: UpdateFunctionCode failed:" >&2
  cat "${code_update_error_file}" >&2
  rm -f "${code_update_error_file}"
  exit "${code_update_status}"
fi
rm -f "${code_update_error_file}"

if [[ "${superseded}" == "true" ]]; then
  # A newer-or-equal deploy already won (see the staleness check above) --
  # verifying the live version against OUR OWN expected_version here could
  # spuriously fail if something even newer than that landed in the
  # meantime, even though production is in a strictly better state than
  # what this run wanted. Nothing this run did, nothing left to verify.
  echo "API Lambda deployment skipped: superseded by a newer or equal live version."
  exit 0
fi

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
