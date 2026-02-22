#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TENANT_CONFIG_PATH="${TENANT_CONFIG_PATH:-${ROOT_DIR}/tools/scripts/config/tenants.json}"
TENANT="${TENANT:-core}"

APP_ID=""
REGION=""
HEADERS_FILE=""
DRY_RUN="false"

print_usage() {
  cat <<'EOF'
Usage:
  tools/scripts/apply-amplify-custom-headers.sh [options]
  tools/scripts/apply-amplify-custom-headers.sh <app_id> <region> [headers_file]

Options:
  --tenant <name>        Tenant key (default: core)
  --config <path>        Tenant config file (default: tools/scripts/config/tenants.json)
  --app-id <id>          Override resolved app id
  --region <region>      Override resolved region
  --headers-file <path>  Override custom headers file path
  --dry-run              Print resolved values only, do not call AWS
  -h, --help             Show this help

Examples:
  tools/scripts/apply-amplify-custom-headers.sh --tenant core
  tools/scripts/apply-amplify-custom-headers.sh --tenant blockchainsummit
  tools/scripts/apply-amplify-custom-headers.sh dy8duury54wam us-east-2
EOF
}

POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tenant)
      TENANT="$2"
      shift 2
      ;;
    --tenant=*)
      TENANT="${1#*=}"
      shift
      ;;
    --config)
      TENANT_CONFIG_PATH="$2"
      shift 2
      ;;
    --config=*)
      TENANT_CONFIG_PATH="${1#*=}"
      shift
      ;;
    --app-id)
      APP_ID="$2"
      shift 2
      ;;
    --app-id=*)
      APP_ID="${1#*=}"
      shift
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --region=*)
      REGION="${1#*=}"
      shift
      ;;
    --headers-file)
      HEADERS_FILE="$2"
      shift 2
      ;;
    --headers-file=*)
      HEADERS_FILE="${1#*=}"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

if [[ ${#POSITIONAL[@]} -gt 0 && -z "${APP_ID}" ]]; then
  APP_ID="${POSITIONAL[0]}"
fi
if [[ ${#POSITIONAL[@]} -gt 1 && -z "${REGION}" ]]; then
  REGION="${POSITIONAL[1]}"
fi
if [[ ${#POSITIONAL[@]} -gt 2 && -z "${HEADERS_FILE}" ]]; then
  HEADERS_FILE="${POSITIONAL[2]}"
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required"
  exit 1
fi

resolve_tenant_json() {
  node - "$ROOT_DIR/tools/scripts/lib/tenant-config.js" "$TENANT" "$TENANT_CONFIG_PATH" <<'NODE'
const [modulePath, tenant, configPath] = process.argv.slice(2);
const { resolveTenant } = require(modulePath);
try {
  const runtime = resolveTenant(tenant, 'development', configPath);
  const payload = {
    tenant: runtime.tenant,
    label: runtime.label,
    appId: runtime.amplify.appId,
    region: runtime.amplify.region,
    headersFile: runtime.headersFile,
  };
  process.stdout.write(JSON.stringify(payload));
} catch (error) {
  process.stderr.write(`Tenant resolution failed: ${error.message}\n`);
  process.exit(1);
}
NODE
}

json_field() {
  local json="$1"
  local key="$2"
  node -e "const obj = JSON.parse(process.argv[1]); process.stdout.write(String(obj[process.argv[2]] || ''));" "$json" "$key"
}

TENANT_INFO_JSON="$(resolve_tenant_json)"
TENANT_LABEL="$(json_field "$TENANT_INFO_JSON" "label")"

if [[ -z "${APP_ID}" ]]; then
  APP_ID="$(json_field "$TENANT_INFO_JSON" "appId")"
fi
if [[ -z "${REGION}" ]]; then
  REGION="$(json_field "$TENANT_INFO_JSON" "region")"
fi
if [[ -z "${HEADERS_FILE}" ]]; then
  HEADERS_FILE="$(json_field "$TENANT_INFO_JSON" "headersFile")"
fi

if [[ ! -f "${HEADERS_FILE}" ]]; then
  echo "Headers file not found: ${HEADERS_FILE}"
  exit 1
fi

echo "Applying Amplify custom headers..."
echo "  tenant: ${TENANT} (${TENANT_LABEL})"
echo "  app:    ${APP_ID}"
echo "  region: ${REGION}"
echo "  file:   ${HEADERS_FILE}"

if [[ "${DRY_RUN}" == "true" ]]; then
  echo
  echo "Dry run enabled; no AWS changes were made."
  exit 0
fi

aws amplify update-app \
  --app-id "${APP_ID}" \
  --region "${REGION}" \
  --custom-headers "file://${HEADERS_FILE}" \
  --query 'app.{appId:appId,name:name,updateTime:updateTime}' \
  --output table

echo
echo "Custom headers now configured on Amplify app:"
aws amplify get-app \
  --app-id "${APP_ID}" \
  --region "${REGION}" \
  --query 'app.customHeaders' \
  --output text
