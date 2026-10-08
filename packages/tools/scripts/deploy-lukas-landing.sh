#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR="${LUKAS_BUILD_DIR:-}"
BUCKET_NAME="${LUKAS_SITE_BUCKET:-hashpass-lukas-landing-site}"
SITE_URL="${LUKAS_SITE_URL:-https://lukas.hashpass.tech}"
EXPECTED_VERSION="${LUKAS_RELEASE_VERSION:-}"
AWS_REGION="${AWS_REGION:-us-east-2}"
LOCK_PREFIX="${LUKAS_LOCK_PREFIX:-_locks/lukas-landing}"
LOCK_WAIT_SECONDS="${LUKAS_LOCK_WAIT_SECONDS:-10800}"
LOCK_ENTRY_TTL_SECONDS="${LUKAS_LOCK_ENTRY_TTL_SECONDS:-86400}"
LOCK_LEASE_SECONDS="${LUKAS_LOCK_LEASE_SECONDS:-7200}"
LOCK_POLL_SECONDS="${LUKAS_LOCK_POLL_SECONDS:-15}"

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
lock_owner="${GITHUB_RUN_ID:-local-$(date +%s%N)-${BASHPID}}-${GITHUB_RUN_ATTEMPT:-1}"
if [[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]]; then
  lock_order="$(printf '%020d' "${GITHUB_RUN_ID}")"
else
  lock_order="$(date +%s%N)"
fi
queue_key="${LOCK_PREFIX}/queue/${lock_order}-${lock_owner}.json"
active_key="${LOCK_PREFIX}/active.json"
lock_held="false"

write_lock_payload() {
  local output_file="$1"
  local kind="$2"
  local expires_at="$3"
  node - "${output_file}" "${kind}" "${lock_owner}" "${EXPECTED_VERSION}" "${expires_at}" "${GITHUB_SHA:-}" <<'NODE'
const fs = require('node:fs');
const [output, kind, owner, version, expiresAt, commit] = process.argv.slice(2);
fs.writeFileSync(output, `${JSON.stringify({
  kind,
  owner,
  version,
  commit,
  createdAt: Math.floor(Date.now() / 1000),
  expiresAt: Number(expiresAt),
})}\n`);
NODE
}

delete_object() {
  aws s3api delete-object \
    --bucket "${BUCKET_NAME}" \
    --key "$1" \
    --region "${AWS_REGION}" \
    >/dev/null 2>&1 || true
}

object_expiry() {
  local object_file="$1"
  node - "${object_file}" <<'NODE'
const fs = require('node:fs');
try {
  const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).expiresAt;
  process.stdout.write(Number.isFinite(value) ? String(value) : '0');
} catch {
  process.stdout.write('0');
}
NODE
}

object_owner() {
  local object_file="$1"
  node - "${object_file}" <<'NODE'
const fs = require('node:fs');
try {
  process.stdout.write(String(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).owner || ''));
} catch {
  process.stdout.write('');
}
NODE
}

queue_head() {
  local keys
  keys="$(aws s3api list-objects-v2 \
    --bucket "${BUCKET_NAME}" \
    --prefix "${LOCK_PREFIX}/queue/" \
    --region "${AWS_REGION}" \
    --query 'Contents[].Key' \
    --output text 2>/dev/null || true)"
  if [[ -z "${keys}" || "${keys}" == "None" ]]; then
    return 0
  fi
  printf '%s\n' "${keys}" | tr '\t' '\n' | sort | head -n 1
}

remove_expired_queue_heads() {
  local head payload expiry now
  while true; do
    head="$(queue_head)"
    [[ -n "${head}" ]] || return 0
    payload="${tmp_dir}/queue-head.json"
    if ! aws s3api get-object \
      --bucket "${BUCKET_NAME}" \
      --key "${head}" \
      --region "${AWS_REGION}" \
      "${payload}" >/dev/null 2>&1; then
      continue
    fi
    expiry="$(object_expiry "${payload}")"
    now="$(date +%s)"
    if [[ "${expiry}" =~ ^[0-9]+$ && "${expiry}" -le "${now}" ]]; then
      echo "Removing expired Lukas queue entry ${head}."
      delete_object "${head}"
      continue
    fi
    return 0
  done
}

clear_expired_active_lock() {
  local payload expiry now
  payload="${tmp_dir}/active-lock.json"
  if ! aws s3api get-object \
    --bucket "${BUCKET_NAME}" \
    --key "${active_key}" \
    --region "${AWS_REGION}" \
    "${payload}" >/dev/null 2>&1; then
    return 0
  fi
  expiry="$(object_expiry "${payload}")"
  now="$(date +%s)"
  if [[ "${expiry}" =~ ^[0-9]+$ && "${expiry}" -le "${now}" ]]; then
    echo "Removing expired Lukas deployment lock."
    delete_object "${active_key}"
  fi
}

release_lock() {
  local payload owner
  if [[ "${lock_held}" == "true" ]]; then
    payload="${tmp_dir}/active-lock-release.json"
    if aws s3api get-object \
      --bucket "${BUCKET_NAME}" \
      --key "${active_key}" \
      --region "${AWS_REGION}" \
      "${payload}" >/dev/null 2>&1; then
      owner="$(object_owner "${payload}")"
      if [[ "${owner}" == "${lock_owner}" ]]; then
        delete_object "${active_key}"
      fi
    fi
    lock_held="false"
  fi
  delete_object "${queue_key}"
}

cleanup() {
  release_lock
  rm -rf "${tmp_dir}"
}

trap cleanup EXIT
trap 'exit 143' INT TERM

queue_payload="${tmp_dir}/queue-entry.json"
write_lock_payload "${queue_payload}" queue "$(( $(date +%s) + LOCK_ENTRY_TTL_SECONDS ))"
aws s3api put-object \
  --bucket "${BUCKET_NAME}" \
  --key "${queue_key}" \
  --region "${AWS_REGION}" \
  --body "${queue_payload}" \
  --content-type application/json \
  --cache-control no-store \
  >/dev/null

lock_deadline="$(( $(date +%s) + LOCK_WAIT_SECONDS ))"
while true; do
  remove_expired_queue_heads
  if [[ "$(queue_head)" == "${queue_key}" ]]; then
    clear_expired_active_lock
    lock_payload="${tmp_dir}/active-lock.json"
    write_lock_payload "${lock_payload}" active "$(( $(date +%s) + LOCK_LEASE_SECONDS ))"
    if aws s3api put-object \
      --bucket "${BUCKET_NAME}" \
      --key "${active_key}" \
      --region "${AWS_REGION}" \
      --body "${lock_payload}" \
      --content-type application/json \
      --cache-control no-store \
      --if-none-match '*' \
      >/dev/null 2>&1; then
      lock_held="true"
      echo "Acquired Lukas deployment queue position ${queue_key}."
      break
    fi
  fi

  if (( $(date +%s) >= lock_deadline )); then
    echo "ERROR: Timed out waiting for Lukas deployment queue." >&2
    exit 1
  fi
  sleep "${LOCK_POLL_SECONDS}"
done

aws s3 sync "${BUILD_DIR}" "s3://${BUCKET_NAME}" \
  --region "${AWS_REGION}" \
  --delete \
  --cache-control 'public,max-age=300' \
  --exclude "${LOCK_PREFIX}/*" \
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
