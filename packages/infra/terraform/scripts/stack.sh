#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STACK="${1:-}"
ACTION="${2:-plan}"
VAR_FILE="${3:-terraform.tfvars}"

if [[ -z "${STACK}" ]]; then
  echo "Usage: $0 <aws|gcp|mobile-release-target|mobile-release-legacy-source-account|hashpass-dns|hashpass-api-target|hashpass-web|hashpass-notion-archive|hashpass-vps-access|hashpass-docs-redirect|hashpass-poker-redirect|event-production-sites> [plan|apply|destroy|validate|fmt] [var-file]"
  exit 1
fi

STACK_DIR="${ROOT_DIR}/stacks/${STACK}"
if [[ ! -d "${STACK_DIR}" ]]; then
  echo "Unknown stack: ${STACK}"
  exit 1
fi

TERRAFORM_INIT_ARGS=()

# This stack owns sensitive one-time SSM activation outputs. It must always use
# the Hashpass account and its encrypted remote backend; never let Terraform
# silently fall back to another ambient AWS profile or local state.
if [[ "${STACK}" == "hashpass-vps-access" ]]; then
  export AWS_PROFILE="hashpass"
  export AWS_REGION="${AWS_REGION:-us-east-2}"

  REPOSITORY_ROOT="$(cd "${ROOT_DIR}/../../.." && pwd)"
  EXPECTED_AWS_ACCOUNT_ID="$(awk -F= '/^AWS_TARGET_ACCOUNT_ID=/{print substr($0, index($0, "=") + 1); exit}' "${REPOSITORY_ROOT}/.env")"
  AWS_ACCOUNT_ID="$(aws sts get-caller-identity --profile "${AWS_PROFILE}" --query Account --output text)"
  if [[ ! "${AWS_ACCOUNT_ID}" =~ ^[0-9]{12}$ ]]; then
    echo "Unable to verify the Hashpass AWS account for the VPS access state backend." >&2
    exit 1
  fi
  if [[ -z "${EXPECTED_AWS_ACCOUNT_ID}" || "${AWS_ACCOUNT_ID}" != "${EXPECTED_AWS_ACCOUNT_ID}" ]]; then
    echo "The Hashpass AWS profile does not match the expected private target account." >&2
    exit 1
  fi

  TERRAFORM_INIT_ARGS=(
    "-backend-config=bucket=hashpass-tfstate-${AWS_ACCOUNT_ID}-${AWS_REGION}"
    "-backend-config=key=self-hosted/hashpass-vps-access/terraform.tfstate"
    "-backend-config=region=${AWS_REGION}"
    "-backend-config=encrypt=true"
    "-backend-config=dynamodb_table=hashpass-terraform-locks"
  )
fi

# Production event sites use their own encrypted, locked remote state. Verify
# the intended Hashpass account before Terraform initializes or mutates it;
# the expected private account ID must come from the caller, never this script.
if [[ "${STACK}" == "event-production-sites" && "${ACTION}" =~ ^(plan|apply|destroy)$ ]]; then
  export AWS_PROFILE="hashpass"
  export AWS_REGION="${AWS_REGION:-us-east-2}"

  EXPECTED_AWS_ACCOUNT_ID="${TF_VAR_expected_account_id:-}"
  if [[ ! "${EXPECTED_AWS_ACCOUNT_ID}" =~ ^[0-9]{12}$ ]]; then
    echo "Set the private TF_VAR_expected_account_id before using the production event-site state." >&2
    exit 1
  fi
  if ! AWS_ACCOUNT_ID="$(aws sts get-caller-identity --profile "${AWS_PROFILE}" --query Account --output text)"; then
    echo "Unable to verify the Hashpass AWS profile for production event-site state." >&2
    exit 1
  fi
  if [[ ! "${AWS_ACCOUNT_ID}" =~ ^[0-9]{12}$ || "${AWS_ACCOUNT_ID}" != "${EXPECTED_AWS_ACCOUNT_ID}" ]]; then
    echo "The Hashpass AWS profile does not match the private expected target account." >&2
    exit 1
  fi

  TERRAFORM_INIT_ARGS=(
    "-backend-config=bucket=hashpass-tfstate-${AWS_ACCOUNT_ID}-${AWS_REGION}"
    "-backend-config=key=event-production-sites/terraform.tfstate"
    "-backend-config=region=${AWS_REGION}"
    "-backend-config=encrypt=true"
    "-backend-config=dynamodb_table=hashpass-terraform-locks"
  )
fi

terraform_init() {
  terraform -chdir="${STACK_DIR}" init "${TERRAFORM_INIT_ARGS[@]}"
}

case "${ACTION}" in
  fmt)
    terraform -chdir="${STACK_DIR}" fmt -recursive
    ;;
  validate)
    terraform -chdir="${STACK_DIR}" init -backend=false
    terraform -chdir="${STACK_DIR}" validate
    ;;
  plan)
    terraform_init
    terraform -chdir="${STACK_DIR}" plan -var-file="${VAR_FILE}"
    ;;
  apply)
    terraform_init
    terraform -chdir="${STACK_DIR}" apply -var-file="${VAR_FILE}"
    ;;
  destroy)
    terraform_init
    terraform -chdir="${STACK_DIR}" destroy -var-file="${VAR_FILE}"
    ;;
  *)
    echo "Unsupported action: ${ACTION}"
    echo "Supported actions: plan, apply, destroy, validate, fmt"
    exit 1
    ;;
esac
