#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TENANT_CONFIG_PATH="${TENANT_CONFIG_PATH:-${ROOT_DIR}/packages/tools/scripts/config/tenants.json}"
TENANT="${TENANT:-core}"
REPO="${AMPLIFY_REPO:-}"
OAUTH_TOKEN="${AMPLIFY_OAUTH_TOKEN:-${OAUTH_TOKEN:-}}"
ACCESS_TOKEN="${AMPLIFY_ACCESS_TOKEN:-${ACCESS_TOKEN:-}}"
APP_ID=""
REGION=""
DRY_RUN="false"

print_usage() {
  cat <<'EOF'
Usage:
  packages/tools/scripts/update-amplify-source-repo.sh [options]

Options:
  --tenant <name>        Tenant key (default: core)
  --config <path>        Tenant config file (default: packages/tools/scripts/config/tenants.json)
  --app-id <id>          Override resolved Amplify app id
  --region <region>      Override resolved Amplify region
  --repo <repo>          Repository name to attach to Amplify (owner/repo)
  --oauth-token <token>  GitHub OAuth token, if Amplify requires one for the update
  --access-token <token> Access token, if your Amplify app uses one instead
  --dry-run              Print resolved values only, do not call AWS
  -h, --help             Show this help

Examples:
  packages/tools/scripts/update-amplify-source-repo.sh --tenant core
  packages/tools/scripts/update-amplify-source-repo.sh --tenant core --repo hashpass-tech/hashpass.tech
  packages/tools/scripts/update-amplify-source-repo.sh --tenant club
  packages/tools/scripts/update-amplify-source-repo.sh --tenant club-dev
EOF
}

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
    --repo)
      REPO="$2"
      shift 2
      ;;
    --repo=*)
      REPO="${1#*=}"
      shift
      ;;
    --oauth-token)
      OAUTH_TOKEN="$2"
      shift 2
      ;;
    --oauth-token=*)
      OAUTH_TOKEN="${1#*=}"
      shift
      ;;
    --access-token)
      ACCESS_TOKEN="$2"
      shift 2
      ;;
    --access-token=*)
      ACCESS_TOKEN="${1#*=}"
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
      echo "ERROR: unknown argument: $1"
      exit 1
      ;;
  esac
done

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required"
  exit 1
fi

resolve_tenant_json() {
  node - "$ROOT_DIR/packages/tools/scripts/lib/tenant-config.js" "$TENANT" "$TENANT_CONFIG_PATH" <<'NODE'
const [modulePath, tenant, configPath] = process.argv.slice(2);
const { resolveTenant } = require(modulePath);
try {
  const runtime = resolveTenant(tenant, 'development', configPath);
  const payload = {
    tenant: runtime.tenant,
    label: runtime.label,
    appId: runtime.amplify.appId,
    region: runtime.amplify.region,
    sourceRepository: runtime.sourceRepository,
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
SOURCE_REPOSITORY="$(json_field "$TENANT_INFO_JSON" "sourceRepository")"

if [[ -z "${APP_ID}" ]]; then
  APP_ID="$(json_field "$TENANT_INFO_JSON" "appId")"
fi

if [[ -z "${REGION}" ]]; then
  REGION="$(json_field "$TENANT_INFO_JSON" "region")"
fi
if [[ -z "${REPO}" ]]; then
  REPO="${SOURCE_REPOSITORY:-hashpass-tech/hashpass.tech}"
fi

if [[ -z "${APP_ID}" || -z "${REGION}" ]]; then
  echo "ERROR: unable to resolve Amplify app id or region."
  exit 1
fi

normalize_repo() {
  local value="$1"

  if [[ "${value}" =~ ^https://github\.com/([^/]+/[^/]+)(\.git)?$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi

  if [[ "${value}" =~ ^git@github\.com:([^/]+/[^/]+)(\.git)?$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return
  fi

  printf '%s' "${value}"
}

REPO="$(normalize_repo "${REPO}")"

echo "Updating Amplify repo source..."
echo "  tenant: ${TENANT} (${TENANT_LABEL})"
echo "  app:    ${APP_ID}"
echo "  region: ${REGION}"
echo "  repo:   ${REPO}"

if [[ "${DRY_RUN}" == "true" ]]; then
  echo
  echo "Dry run enabled; no AWS changes were made."
  exit 0
fi

if [[ -z "${OAUTH_TOKEN}" && -z "${ACCESS_TOKEN}" ]]; then
  echo "ERROR: set AMPLIFY_ACCESS_TOKEN (GitHub) or AMPLIFY_OAUTH_TOKEN before updating an Amplify app."
  exit 1
fi

aws_args=(
  amplify update-app
  --app-id "${APP_ID}"
  --region "${REGION}"
  --repository "${REPO}"
)

if [[ -n "${OAUTH_TOKEN}" ]]; then
  aws_args+=(--oauth-token "${OAUTH_TOKEN}")
elif [[ -n "${ACCESS_TOKEN}" ]]; then
  aws_args+=(--access-token "${ACCESS_TOKEN}")
fi

aws "${aws_args[@]}" \
  --query 'app.{appId:appId,name:name,repository:repository,platform:platform,updateTime:updateTime}' \
  --output table

echo
echo "Amplify repo source updated."
