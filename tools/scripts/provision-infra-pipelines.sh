#!/usr/bin/env bash
set -euo pipefail

EXPECTED_ACCOUNT_ID="${EXPECTED_AWS_ACCOUNT_ID:-${AWS_ACCOUNT_ID:-}}"
REGION="${AWS_REGION:-us-east-2}"
REPO="${GITHUB_REPOSITORY:-edcalderon/hashpass.tech}"
RESOURCE_PREFIX="${RESOURCE_PREFIX:-bsl-hashpass}"
CONNECTION_NAME="${CONNECTION_NAME:-${RESOURCE_PREFIX}-github-${REGION}}"
PIPELINE_ROLE_NAME="${PIPELINE_ROLE_NAME:-BslHashpassPipelineRole}"
CODEBUILD_ROLE_NAME="${CODEBUILD_ROLE_NAME:-BslHashpassCodeBuildRole}"
BUILDSPEC_FILE="${BUILDSPEC_FILE:-tools/buildspecs/infra-deploy.yml}"
CODEBUILD_CACHE_NAMESPACE="${CODEBUILD_CACHE_NAMESPACE:-${RESOURCE_PREFIX}}"
CODEBUILD_COMPUTE_TYPE_DEV="${CODEBUILD_COMPUTE_TYPE_DEV:-BUILD_GENERAL1_MEDIUM}"
CODEBUILD_COMPUTE_TYPE_PROD="${CODEBUILD_COMPUTE_TYPE_PROD:-BUILD_GENERAL1_LARGE}"
EXPO_EXPORT_MAX_WORKERS_DEV="${EXPO_EXPORT_MAX_WORKERS_DEV:-4}"
EXPO_EXPORT_MAX_WORKERS_PROD="${EXPO_EXPORT_MAX_WORKERS_PROD:-6}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -n "${1:-}" && "${1:-}" != "--dry-run" ]]; then
  REPO="$1"
fi

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" || "${2:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

if [[ -z "${REPO}" ]]; then
  echo "ERROR: set GITHUB_REPOSITORY or pass <owner>/<repo> as the first argument."
  exit 1
fi

CURRENT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [[ -z "${CURRENT_ACCOUNT}" ]]; then
  echo "ERROR: unable to determine AWS account. Configure AWS credentials first."
  exit 1
fi

ACCOUNT_ID="${AWS_ACCOUNT_ID:-${CURRENT_ACCOUNT}}"
ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-${RESOURCE_PREFIX}-pipelines-${ACCOUNT_ID}-${REGION}}"
CODEBUILD_CACHE_LOCATION="${CODEBUILD_CACHE_LOCATION:-${ARTIFACT_BUCKET}/codebuild-cache}"

if [[ -n "${EXPECTED_ACCOUNT_ID}" && "${CURRENT_ACCOUNT}" != "${EXPECTED_ACCOUNT_ID}" ]]; then
  echo "ERROR: AWS caller identity is ${CURRENT_ACCOUNT}, expected ${EXPECTED_ACCOUNT_ID}."
  exit 1
fi

CONNECTION_ARN="${CONNECTION_ARN:-$(aws codeconnections list-connections \
  --region "${REGION}" \
  --query "Connections[?ConnectionName=='${CONNECTION_NAME}'].ConnectionArn | [0]" \
  --output text 2>/dev/null || true)}"

if [[ -z "${CONNECTION_ARN}" || "${CONNECTION_ARN}" == "None" ]]; then
  echo "ERROR: could not find a CodeConnections connection named ${CONNECTION_NAME} in ${REGION}."
  echo "Run tools/scripts/provision-infra-connection.sh first."
  exit 1
fi

pipeline_role_arn=""
codebuild_role_arn=""

read_env_value() {
  local key="$1"
  local value=""

  if [[ -f "${ROOT_DIR}/.env" ]]; then
    value="$(awk -F= -v key="$key" '
      $1 == key {
        sub(/^[^=]*=/, "", $0);
        print;
        exit
      }
    ' "${ROOT_DIR}/.env" 2>/dev/null || true)"
  fi

  if [[ -z "${value}" ]]; then
    value="${!key:-}"
  fi

  printf '%s' "${value}"
}

append_env_var() {
  local name="$1"
  local value="$2"

  if [[ -z "${value}" ]]; then
    return
  fi

  if [[ "${env_vars}" == "[" ]]; then
    env_vars+="{name=${name},value=${value},type=PLAINTEXT}"
  else
    env_vars+=",{name=${name},value=${value},type=PLAINTEXT}"
  fi
}

ensure_role() {
  local role_name="$1"
  local trust_service="$2"
  local description="$3"
  local policy_arn="$4"

  if aws iam get-role --role-name "${role_name}" --query 'Role.Arn' --output text >/dev/null 2>&1; then
    aws iam get-role --role-name "${role_name}" --query 'Role.Arn' --output text
    return
  fi

  local trust_policy
  trust_policy=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "${trust_service}"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
)

  aws iam create-role \
    --role-name "${role_name}" \
    --assume-role-policy-document "${trust_policy}" \
    --description "${description}" \
    --region "${REGION}" >/dev/null

  aws iam attach-role-policy \
    --role-name "${role_name}" \
    --policy-arn "${policy_arn}" \
    --region "${REGION}" >/dev/null

  aws iam get-role --role-name "${role_name}" --query 'Role.Arn' --output text
}

ensure_bucket() {
  if aws s3api head-bucket --bucket "${ARTIFACT_BUCKET}" >/dev/null 2>&1; then
    return
  fi

  aws s3api create-bucket \
    --bucket "${ARTIFACT_BUCKET}" \
    --create-bucket-configuration LocationConstraint="${REGION}" \
    --region "${REGION}" >/dev/null
}

create_or_update_codebuild() {
  local stage_name="$1"
  local project_name="$2"
  local build_role_arn="$3"
  local stage_suffix=""
  local compute_type=""
  local expo_export_max_workers=""

  if [[ "${DRY_RUN}" == true ]]; then
    echo "Would create/update CodeBuild project ${project_name} (${stage_name})"
    return
  fi

  case "${stage_name}" in
    dev|development)
      stage_suffix="_DEV"
      compute_type="${CODEBUILD_COMPUTE_TYPE_DEV}"
      expo_export_max_workers="${EXPO_EXPORT_MAX_WORKERS_DEV}"
      supabase_profile="bsl-development"
      ;;
    prod|production)
      stage_suffix="_PROD"
      compute_type="${CODEBUILD_COMPUTE_TYPE_PROD}"
      expo_export_max_workers="${EXPO_EXPORT_MAX_WORKERS_PROD}"
      supabase_profile="bsl-production"
      ;;
    *)
      compute_type="${CODEBUILD_COMPUTE_TYPE_PROD}"
      expo_export_max_workers="${EXPO_EXPORT_MAX_WORKERS_PROD}"
      supabase_profile="bsl-production"
      ;;
  esac

  local supabase_url=""
  local supabase_anon_key=""
  local supabase_profile=""
  local bsl_supabase_url=""
  local bsl_supabase_anon_key=""
  local bsl_supabase_service_role_key=""
  local bsl_supabase_db_url=""
  local stage_supabase_url_key=""
  local stage_supabase_key_key=""
  local stage_bsl_supabase_url_key=""
  local stage_bsl_supabase_key_key=""
  local stage_bsl_supabase_service_role_key=""
  local stage_bsl_supabase_db_url_key=""

  stage_supabase_url_key="EXPO_PUBLIC_SUPABASE_URL${stage_suffix}"
  stage_supabase_key_key="EXPO_PUBLIC_SUPABASE_KEY${stage_suffix}"
  stage_bsl_supabase_url_key="EXPO_PUBLIC_BSL_SUPABASE_URL${stage_suffix}"
  stage_bsl_supabase_key_key="EXPO_PUBLIC_BSL_SUPABASE_KEY${stage_suffix}"
  stage_bsl_supabase_service_role_key="BSL_SUPABASE_SERVICE_ROLE_KEY${stage_suffix}"
  stage_bsl_supabase_db_url_key="BSL_SUPABASE_DB_URL${stage_suffix}"

  supabase_url="$(read_env_value "${stage_supabase_url_key}")"
  if [[ -z "${supabase_url}" ]]; then
    supabase_url="$(read_env_value EXPO_PUBLIC_SUPABASE_URL)"
  fi
  if [[ -z "${supabase_url}" ]]; then
    supabase_url="$(read_env_value NEXT_PUBLIC_SUPABASE_URL)"
  fi

  supabase_anon_key="$(read_env_value "${stage_supabase_key_key}")"
  if [[ -z "${supabase_anon_key}" ]]; then
    supabase_anon_key="$(read_env_value EXPO_PUBLIC_SUPABASE_ANON_KEY)"
  fi
  if [[ -z "${supabase_anon_key}" ]]; then
    supabase_anon_key="$(read_env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)"
  fi
  if [[ -z "${supabase_anon_key}" ]]; then
    supabase_anon_key="$(read_env_value EXPO_PUBLIC_SUPABASE_KEY)"
  fi

  bsl_supabase_url="$(read_env_value "${stage_bsl_supabase_url_key}")"
  if [[ -z "${bsl_supabase_url}" ]]; then
    bsl_supabase_url="$(read_env_value EXPO_PUBLIC_BSL_SUPABASE_URL)"
  fi
  if [[ -z "${bsl_supabase_url}" ]]; then
    bsl_supabase_url="${supabase_url}"
  fi

  bsl_supabase_anon_key="$(read_env_value "${stage_bsl_supabase_key_key}")"
  if [[ -z "${bsl_supabase_anon_key}" ]]; then
    bsl_supabase_anon_key="$(read_env_value EXPO_PUBLIC_BSL_SUPABASE_KEY)"
  fi
  if [[ -z "${bsl_supabase_anon_key}" ]]; then
    bsl_supabase_anon_key="${supabase_anon_key}"
  fi

  bsl_supabase_service_role_key="$(read_env_value "${stage_bsl_supabase_service_role_key}")"
  if [[ -z "${bsl_supabase_service_role_key}" ]]; then
    bsl_supabase_service_role_key="$(read_env_value BSL_SUPABASE_SERVICE_ROLE_KEY)"
  fi

  bsl_supabase_db_url="$(read_env_value "${stage_bsl_supabase_db_url_key}")"
  if [[ -z "${bsl_supabase_db_url}" ]]; then
    bsl_supabase_db_url="$(read_env_value BSL_SUPABASE_DB_URL)"
  fi

  if [[ -z "${supabase_url}" || -z "${supabase_anon_key}" ]]; then
    echo "ERROR: missing Supabase public env for ${stage_name}."
    echo "Expected one of:"
    echo "  - ${stage_supabase_url_key}"
    echo "  - EXPO_PUBLIC_SUPABASE_URL"
    echo "  - NEXT_PUBLIC_SUPABASE_URL"
    echo "  - ${stage_supabase_key_key}"
    echo "  - EXPO_PUBLIC_SUPABASE_KEY"
    echo "  - EXPO_PUBLIC_SUPABASE_ANON_KEY"
    echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
    exit 1
  fi

  local env_vars
  env_vars="["
  append_env_var "TARGET_STAGE" "${stage_name}"
  append_env_var "AWS_REGION" "${REGION}"
  append_env_var "AWS_DEFAULT_REGION" "${REGION}"
  append_env_var "EXPO_PUBLIC_SUPABASE_PROFILE" "${supabase_profile}"
  append_env_var "SUPABASE_PROFILE" "${supabase_profile}"
  append_env_var "EXPO_PUBLIC_SUPABASE_URL" "${supabase_url}"
  append_env_var "NEXT_PUBLIC_SUPABASE_URL" "${supabase_url}"
  append_env_var "EXPO_PUBLIC_SUPABASE_KEY" "${supabase_anon_key}"
  append_env_var "EXPO_PUBLIC_SUPABASE_ANON_KEY" "${supabase_anon_key}"
  append_env_var "NEXT_PUBLIC_SUPABASE_ANON_KEY" "${supabase_anon_key}"
  append_env_var "${stage_bsl_supabase_url_key}" "${bsl_supabase_url}"
  append_env_var "${stage_bsl_supabase_key_key}" "${bsl_supabase_anon_key}"
  append_env_var "${stage_bsl_supabase_service_role_key}" "${bsl_supabase_service_role_key}"
  append_env_var "${stage_bsl_supabase_db_url_key}" "${bsl_supabase_db_url}"
  append_env_var "EXPO_PUBLIC_BSL_SUPABASE_URL" "${bsl_supabase_url}"
  append_env_var "EXPO_PUBLIC_BSL_SUPABASE_KEY" "${bsl_supabase_anon_key}"
  append_env_var "BSL_SUPABASE_SERVICE_ROLE_KEY" "${bsl_supabase_service_role_key}"
  append_env_var "BSL_SUPABASE_DB_URL" "${bsl_supabase_db_url}"
  append_env_var "EXPO_EXPORT_MAX_WORKERS" "${expo_export_max_workers}"
  env_vars+="]"

  if aws codebuild create-project \
    --region "${REGION}" \
    --name "${project_name}" \
    --service-role "${build_role_arn}" \
    --source "type=CODEPIPELINE,buildspec=${BUILDSPEC_FILE}" \
    --artifacts "type=CODEPIPELINE" \
    --environment "type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=${compute_type},privilegedMode=false,environmentVariables=${env_vars}" \
    --cache "type=S3,location=${CODEBUILD_CACHE_LOCATION},cacheNamespace=${CODEBUILD_CACHE_NAMESPACE}" \
    >/dev/null 2>&1; then
    return
  fi

  aws codebuild update-project \
    --region "${REGION}" \
    --name "${project_name}" \
    --service-role "${build_role_arn}" \
    --source "type=CODEPIPELINE,buildspec=${BUILDSPEC_FILE}" \
    --artifacts "type=CODEPIPELINE" \
    --environment "type=LINUX_CONTAINER,image=aws/codebuild/standard:7.0,computeType=${compute_type},privilegedMode=false,environmentVariables=${env_vars}" \
    --cache "type=S3,location=${CODEBUILD_CACHE_LOCATION},cacheNamespace=${CODEBUILD_CACHE_NAMESPACE}" \
    >/dev/null
}

write_pipeline_json() {
  local pipeline_name="$1"
  local branch_name="$2"
  local project_name="$3"
  local role_arn="$4"
  local output_file="$5"

  cat >"${output_file}" <<EOF
{
  "name": "${pipeline_name}",
  "roleArn": "${role_arn}",
  "artifactStore": {
    "type": "S3",
    "location": "${ARTIFACT_BUCKET}"
  },
  "stages": [
    {
      "name": "Source",
      "actions": [
        {
          "name": "Source",
          "actionTypeId": {
            "category": "Source",
            "owner": "AWS",
            "provider": "CodeStarSourceConnection",
            "version": "1"
          },
          "configuration": {
            "ConnectionArn": "${CONNECTION_ARN}",
            "FullRepositoryId": "${REPO}",
            "BranchName": "${branch_name}",
            "OutputArtifactFormat": "CODE_ZIP"
          },
          "outputArtifacts": [
            {
              "name": "SourceArtifact"
            }
          ],
          "runOrder": 1
        }
      ]
    },
    {
      "name": "Build",
      "actions": [
        {
          "name": "DeployInfra",
          "actionTypeId": {
            "category": "Build",
            "owner": "AWS",
            "provider": "CodeBuild",
            "version": "1"
          },
          "configuration": {
            "ProjectName": "${project_name}"
          },
          "inputArtifacts": [
            {
              "name": "SourceArtifact"
            }
          ],
          "runOrder": 1
        }
      ]
    }
  ],
  "version": 1
}
EOF
}

create_or_update_pipeline() {
  local pipeline_name="$1"
  local branch_name="$2"
  local project_name="$3"
  local role_arn="$4"
  local tmp_file
  tmp_file="$(mktemp)"
  write_pipeline_json "${pipeline_name}" "${branch_name}" "${project_name}" "${role_arn}" "${tmp_file}"

  if [[ "${DRY_RUN}" == true ]]; then
    echo "Would create/update CodePipeline ${pipeline_name} on branch ${branch_name}"
    rm -f "${tmp_file}"
    return
  fi

  if aws codepipeline get-pipeline --region "${REGION}" --name "${pipeline_name}" >/dev/null 2>&1; then
    aws codepipeline update-pipeline --region "${REGION}" --pipeline "file://${tmp_file}" >/dev/null
  else
    aws codepipeline create-pipeline --region "${REGION}" --pipeline "file://${tmp_file}" >/dev/null
  fi

  rm -f "${tmp_file}"
}

echo "Provisioning infra pipelines"
echo "  Account:         ${ACCOUNT_ID}"
echo "  Region:          ${REGION}"
echo "  Prefix:          ${RESOURCE_PREFIX}"
echo "  Repository:      ${REPO}"
echo "  Connection ARN:  ${CONNECTION_ARN}"
echo "  Artifact bucket: ${ARTIFACT_BUCKET}"
echo "  Dry run:         ${DRY_RUN}"
echo ""

pipeline_role_arn="$(ensure_role "${PIPELINE_ROLE_NAME}" "codepipeline.amazonaws.com" "Role for HashPass infra pipelines" "arn:aws:iam::aws:policy/AdministratorAccess")"
codebuild_role_arn="$(ensure_role "${CODEBUILD_ROLE_NAME}" "codebuild.amazonaws.com" "Role for HashPass infra CodeBuild projects" "arn:aws:iam::aws:policy/AdministratorAccess")"

if [[ "${DRY_RUN}" == false ]]; then
  ensure_bucket
fi

create_or_update_codebuild "dev" "${RESOURCE_PREFIX}-dev-build" "${codebuild_role_arn}"
create_or_update_codebuild "prod" "${RESOURCE_PREFIX}-prod-build" "${codebuild_role_arn}"

create_or_update_pipeline "${RESOURCE_PREFIX}-dev" "develop" "${RESOURCE_PREFIX}-dev-build" "${pipeline_role_arn}"
create_or_update_pipeline "${RESOURCE_PREFIX}-prod" "main" "${RESOURCE_PREFIX}-prod-build" "${pipeline_role_arn}"

echo ""
echo "Pipeline provisioning complete."
echo "  Dev pipeline:        ${RESOURCE_PREFIX}-dev"
echo "  Production pipeline: ${RESOURCE_PREFIX}-prod"
echo "  CodeBuild roles and pipeline roles are in account ${ACCOUNT_ID}."
