#!/usr/bin/env bash
set -euo pipefail

# This is a break-glass path for a GitHub Actions incident, not a second CI
# trigger. It starts the retained AWS CodePipeline/CodeBuild implementation
# only after its normal CodeConnections trigger has been disabled.

PROFILE="${AWS_PROFILE:-hashpass}"
REGION="${AWS_REGION:-us-east-2}"
EXPECTED_ACCOUNT_ID="${EXPECTED_AWS_ACCOUNT_ID:-${TARGET_AWS_ACCOUNT_ID:-${AWS_ACCOUNT_ID:-}}}"
ENVIRONMENT=""
COMMIT=""
INCIDENT=""
EXECUTE=false

usage() {
  cat <<'EOF'
Usage: start-web-pipeline-disaster-recovery.sh \
  --environment development|production --commit <full-commit-sha> \
  --incident <incident-or-change-reference> [--execute]

Dry-run is the default. --execute starts a chargeable AWS CodePipeline and
CodeBuild deployment. It is allowed only after the pipeline's normal source
trigger has been disabled as part of a completed GitHub Actions migration.

Required environment:
  EXPECTED_AWS_ACCOUNT_ID  Private expected account ID for the hashpass profile.

Optional environment:
  AWS_PROFILE              Defaults to hashpass.
  AWS_REGION               Defaults to us-east-2.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment)
      ENVIRONMENT="${2:-}"
      shift 2
      ;;
    --commit)
      COMMIT="${2:-}"
      shift 2
      ;;
    --incident)
      INCIDENT="${2:-}"
      shift 2
      ;;
    --execute)
      EXECUTE=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "${ENVIRONMENT}" != "development" && "${ENVIRONMENT}" != "production" ]]; then
  echo "ERROR: --environment must be development or production." >&2
  exit 2
fi

if [[ ! "${COMMIT}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: --commit must be a full 40-character Git commit SHA." >&2
  exit 2
fi

if [[ -z "${INCIDENT}" || "${#INCIDENT}" -gt 120 || "${INCIDENT}" == *$'\n'* ]]; then
  echo "ERROR: --incident must be a non-empty, single-line reference of at most 120 characters." >&2
  exit 2
fi

if [[ -z "${EXPECTED_ACCOUNT_ID}" ]]; then
  echo "ERROR: set EXPECTED_AWS_ACCOUNT_ID before using the break-glass path." >&2
  exit 2
fi

CURRENT_ACCOUNT_ID="$(aws --profile "${PROFILE}" sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [[ -z "${CURRENT_ACCOUNT_ID}" || "${CURRENT_ACCOUNT_ID}" != "${EXPECTED_ACCOUNT_ID}" ]]; then
  echo "ERROR: the configured AWS profile did not match the expected production account." >&2
  exit 1
fi

case "${ENVIRONMENT}" in
  development) PIPELINE_NAME="hashpass-dev-site" ;;
  production) PIPELINE_NAME="hashpass-production-site" ;;
esac

detect_changes="$(aws --profile "${PROFILE}" --region "${REGION}" codepipeline get-pipeline \
  --name "${PIPELINE_NAME}" \
  --query "pipeline.stages[?name=='Source'].actions[?name=='Source'].configuration.DetectChanges | [0]" \
  --output text)"

if [[ "${detect_changes}" != "false" && "${detect_changes}" != "False" ]]; then
  echo "ERROR: ${PIPELINE_NAME} still has its normal source trigger enabled; refusing a duplicate fallback build." >&2
  exit 1
fi

active_executions="$(aws --profile "${PROFILE}" --region "${REGION}" codepipeline list-pipeline-executions \
  --pipeline-name "${PIPELINE_NAME}" \
  --max-results 10 \
  --query "length(pipelineExecutionSummaries[?status=='InProgress' || status=='Queued' || status=='Stopping'])" \
  --output text)"

if [[ "${active_executions}" != "0" ]]; then
  echo "ERROR: ${PIPELINE_NAME} already has an active execution; inspect it before retrying." >&2
  exit 1
fi

# CodePipeline treats this as an idempotency token. A retry for the same pinned
# revision needs a distinct token so it starts a replacement execution rather
# than returning a stopped or failed earlier execution.
attempt_nonce="$(date -u +%Y%m%d%H%M%S)-$(od -An -N4 -tx4 /dev/urandom | tr -d '[:space:]')"
request_token="hashpass-dr-${ENVIRONMENT}-${COMMIT:0:12}-${attempt_nonce}"
echo "Break-glass request prepared for ${ENVIRONMENT} pipeline at commit ${COMMIT}."
echo "Incident/change reference: ${INCIDENT}"
echo "Recovery attempt: ${attempt_nonce}"

if [[ "${EXECUTE}" != true ]]; then
  echo "Dry run only. Re-run with --execute after the incident owner confirms the fallback release."
  exit 0
fi

execution_id="$(aws --profile "${PROFILE}" --region "${REGION}" codepipeline start-pipeline-execution \
  --name "${PIPELINE_NAME}" \
  --client-request-token "${request_token}" \
  --source-revisions "actionName=Source,revisionType=COMMIT_ID,revisionValue=${COMMIT}" \
  --query pipelineExecutionId \
  --output text)"

echo "AWS disaster-recovery pipeline execution started: ${execution_id}"
