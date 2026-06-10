#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STACK="${1:-}"
ACTION="${2:-plan}"
VAR_FILE="${3:-terraform.tfvars}"

if [[ -z "${STACK}" ]]; then
  echo "Usage: $0 <aws|gcp> [plan|apply|destroy|validate|fmt] [var-file]"
  exit 1
fi

STACK_DIR="${ROOT_DIR}/stacks/${STACK}"
if [[ ! -d "${STACK_DIR}" ]]; then
  echo "Unknown stack: ${STACK}"
  exit 1
fi

case "${ACTION}" in
  fmt)
    terraform -chdir="${STACK_DIR}" fmt -recursive
    ;;
  validate)
    terraform -chdir="${STACK_DIR}" init -backend=false
    terraform -chdir="${STACK_DIR}" validate
    ;;
  plan)
    terraform -chdir="${STACK_DIR}" init
    terraform -chdir="${STACK_DIR}" plan -var-file="${VAR_FILE}"
    ;;
  apply)
    terraform -chdir="${STACK_DIR}" init
    terraform -chdir="${STACK_DIR}" apply -var-file="${VAR_FILE}"
    ;;
  destroy)
    terraform -chdir="${STACK_DIR}" init
    terraform -chdir="${STACK_DIR}" destroy -var-file="${VAR_FILE}"
    ;;
  *)
    echo "Unsupported action: ${ACTION}"
    echo "Supported actions: plan, apply, destroy, validate, fmt"
    exit 1
    ;;
esac
