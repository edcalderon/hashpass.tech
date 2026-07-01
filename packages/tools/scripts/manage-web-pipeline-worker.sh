#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-2}}"
PIPELINE_NAMES_RAW="${WEB_PIPELINE_NAMES:-hashpass-dev-site,hashpass-production-site}"
PROJECT_TAG="${WEB_PIPELINE_PROJECT_TAG:-hashpass}"
SERVICE_TAG="${WEB_PIPELINE_SERVICE_TAG:-pipeline-build-worker}"
GRACE_SECONDS="${WEB_PIPELINE_GRACE_SECONDS:-90}"
START_WAIT_SECONDS="${WEB_PIPELINE_START_WAIT_SECONDS:-600}"
POLL_SECONDS="${WEB_PIPELINE_POLL_SECONDS:-20}"
SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-}"
MODE="monitor"

log() {
  printf '[hashpass-web-worker] %s\n' "$1"
}

summary() {
  if [[ -n "${SUMMARY_FILE}" ]]; then
    printf '%s\n' "$1" >> "${SUMMARY_FILE}"
  fi
}

trim_value() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

parse_pipeline_names() {
  PIPELINE_NAMES=()

  IFS=',' read -r -a raw_names <<< "${PIPELINE_NAMES_RAW}"
  for raw_name in "${raw_names[@]}"; do
    local name
    name="$(trim_value "${raw_name}")"
    if [[ -n "${name}" ]]; then
      PIPELINE_NAMES+=("${name}")
    fi
  done
}

usage() {
  cat <<'EOF'
Usage: manage-web-pipeline-worker.sh [--mode monitor|stop] [--pipelines name1,name2] [--region us-east-2]

Environment variables:
  WEB_PIPELINE_NAMES
  WEB_PIPELINE_PROJECT_TAG
  WEB_PIPELINE_SERVICE_TAG
  WEB_PIPELINE_GRACE_SECONDS
  WEB_PIPELINE_START_WAIT_SECONDS
  WEB_PIPELINE_POLL_SECONDS
EOF
}

worker_instance_ids() {
  aws ec2 describe-instances \
    --region "${REGION}" \
    --filters \
      "Name=tag:Project,Values=${PROJECT_TAG}" \
      "Name=tag:Service,Values=${SERVICE_TAG}" \
      "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --output json \
    | jq -r '.Reservations[]?.Instances[]?.InstanceId'
}

worker_instance_report() {
  aws ec2 describe-instances \
    --region "${REGION}" \
    --filters \
      "Name=tag:Project,Values=${PROJECT_TAG}" \
      "Name=tag:Service,Values=${SERVICE_TAG}" \
      "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --output json \
    | jq -r '
      .Reservations[]?.Instances[]? |
      [
        .InstanceId,
        .State.Name,
        ([.Tags[]? | select(.Key == "Name") | .Value][0] // "")
      ] | @tsv
    '
}

pipeline_state_lines() {
  local pipeline_name="$1"

  aws codepipeline get-pipeline-state \
    --region "${REGION}" \
    --name "${pipeline_name}" \
    --output json \
    | jq -r '
      .stageStates[]? as $stage |
      if ($stage.actionStates | length) == 0 then
        "\($stage.stageName): idle"
      else
        $stage.actionStates[]? |
          "\($stage.stageName)/\(.actionName)=\(.latestExecution.status // "Unknown")"
      end
    '
}

pipeline_is_active() {
  local pipeline_name="$1"
  local executions_json state_json execution_count stage_count

  executions_json="$(aws codepipeline list-pipeline-executions \
    --region "${REGION}" \
    --pipeline-name "${pipeline_name}" \
    --max-results 10 \
    --output json)"
  state_json="$(aws codepipeline get-pipeline-state \
    --region "${REGION}" \
    --name "${pipeline_name}" \
    --output json)"

  execution_count="$(jq '[.pipelineExecutionSummaries[]? | select(.status == "InProgress" or .status == "Stopping" or .status == "Queued")] | length' <<<"${executions_json}")"
  stage_count="$(jq '[.stageStates[]? | .actionStates[]? | select(.latestExecution.status == "InProgress" or .latestExecution.status == "Stopping" or .latestExecution.status == "Queued")] | length' <<<"${state_json}")"

  [[ "${execution_count}" -gt 0 || "${stage_count}" -gt 0 ]]
}

log_snapshot() {
  local pipeline_name

  summary "## HashPass Web Pipeline Monitor"
  summary ""
  summary "- Region: ${REGION}"
  summary "- Pipelines: ${PIPELINE_NAMES[*]}"
  summary "- Worker tag filter: Project=${PROJECT_TAG}, Service=${SERVICE_TAG}"
  summary ""

  for pipeline_name in "${PIPELINE_NAMES[@]}"; do
    log "Pipeline ${pipeline_name}:"
    while IFS= read -r line; do
      [[ -n "${line}" ]] || continue
      log "  ${line}"
    done < <(pipeline_state_lines "${pipeline_name}" || true)
  done

  log "Worker instances:"
  while IFS=$'\t' read -r instance_id state instance_name; do
    [[ -n "${instance_id}" ]] || continue
    log "  ${instance_id} (${instance_name:-unnamed}): ${state}"
  done < <(worker_instance_report || true)
}

ensure_worker_running() {
  local worker_ids=()
  local instance_id state

  mapfile -t worker_ids < <(worker_instance_ids)
  if [[ "${#worker_ids[@]}" -eq 0 ]]; then
    log "No EC2 worker instances matched Project=${PROJECT_TAG}, Service=${SERVICE_TAG}."
    return 1
  fi

  for instance_id in "${worker_ids[@]}"; do
    state="$(aws ec2 describe-instances \
      --region "${REGION}" \
      --instance-ids "${instance_id}" \
      --query 'Reservations[0].Instances[0].State.Name' \
      --output text)"

    case "${state}" in
      running)
        log "Worker ${instance_id} already running."
        ;;
      pending)
        log "Worker ${instance_id} is pending; waiting for it to come online."
        aws ec2 wait instance-running --region "${REGION}" --instance-ids "${instance_id}"
        ;;
      stopped)
        log "Starting worker ${instance_id}."
        aws ec2 start-instances --region "${REGION}" --instance-ids "${instance_id}" >/dev/null
        aws ec2 wait instance-running --region "${REGION}" --instance-ids "${instance_id}"
        ;;
      stopping)
        log "Worker ${instance_id} is stopping; waiting for it to finish before restarting."
        aws ec2 wait instance-stopped --region "${REGION}" --instance-ids "${instance_id}"
        aws ec2 start-instances --region "${REGION}" --instance-ids "${instance_id}" >/dev/null
        aws ec2 wait instance-running --region "${REGION}" --instance-ids "${instance_id}"
        ;;
      *)
        log "Unexpected worker state for ${instance_id}: ${state}"
        return 1
        ;;
    esac
  done
}

stop_worker_if_idle() {
  local active_pipelines=()
  local worker_ids=()
  local stop_ids=()
  local wait_ids=()
  local instance_id state

  for pipeline_name in "${PIPELINE_NAMES[@]}"; do
    if pipeline_is_active "${pipeline_name}"; then
      active_pipelines+=("${pipeline_name}")
    fi
  done

  if [[ "${#active_pipelines[@]}" -gt 0 ]]; then
    log "Skipping stop; active pipelines: ${active_pipelines[*]}"
    return 1
  fi

  log "No active pipelines detected; waiting ${GRACE_SECONDS}s before stopping the worker."
  if [[ "${GRACE_SECONDS}" -gt 0 ]]; then
    sleep "${GRACE_SECONDS}"
  fi

  active_pipelines=()
  for pipeline_name in "${PIPELINE_NAMES[@]}"; do
    if pipeline_is_active "${pipeline_name}"; then
      active_pipelines+=("${pipeline_name}")
    fi
  done

  if [[ "${#active_pipelines[@]}" -gt 0 ]]; then
    log "New pipeline activity detected during the grace period: ${active_pipelines[*]}"
    return 1
  fi

  mapfile -t worker_ids < <(worker_instance_ids)
  if [[ "${#worker_ids[@]}" -eq 0 ]]; then
    log "No EC2 worker instances matched Project=${PROJECT_TAG}, Service=${SERVICE_TAG}."
    return 1
  fi

  for instance_id in "${worker_ids[@]}"; do
    state="$(aws ec2 describe-instances \
      --region "${REGION}" \
      --instance-ids "${instance_id}" \
      --query 'Reservations[0].Instances[0].State.Name' \
      --output text)"

    case "${state}" in
      running|pending)
        stop_ids+=("${instance_id}")
        wait_ids+=("${instance_id}")
        ;;
      stopping)
        wait_ids+=("${instance_id}")
        ;;
      stopped)
        ;;
      *)
        log "Unexpected worker state for ${instance_id}: ${state}"
        return 1
        ;;
    esac
  done

  if [[ "${#stop_ids[@]}" -gt 0 ]]; then
    log "Stopping worker instances: ${stop_ids[*]}"
    aws ec2 stop-instances --region "${REGION}" --instance-ids "${stop_ids[@]}" >/dev/null
  else
    log "Worker instances already stopped."
  fi

  if [[ "${#wait_ids[@]}" -gt 0 ]]; then
    aws ec2 wait instance-stopped --region "${REGION}" --instance-ids "${wait_ids[@]}"
  fi

  log "Worker stop check completed."
  return 0
}

monitor_mode() {
  local deadline active_pipelines=()
  local pipeline_name

  ensure_worker_running
  log_snapshot

  deadline=$((SECONDS + START_WAIT_SECONDS))
  while true; do
    active_pipelines=()
    for pipeline_name in "${PIPELINE_NAMES[@]}"; do
      if pipeline_is_active "${pipeline_name}"; then
        active_pipelines+=("${pipeline_name}")
      fi
    done

    if [[ "${#active_pipelines[@]}" -gt 0 ]]; then
      log "Active pipelines detected: ${active_pipelines[*]}"
      break
    fi

    if (( SECONDS >= deadline )); then
      log "No active pipeline execution appeared within ${START_WAIT_SECONDS}s."
      if stop_worker_if_idle; then
        summary ""
        summary "- Final action: worker stopped after no pipeline execution appeared."
        return 1
      fi

      active_pipelines=()
      for pipeline_name in "${PIPELINE_NAMES[@]}"; do
        if pipeline_is_active "${pipeline_name}"; then
          active_pipelines+=("${pipeline_name}")
        fi
      done

      if [[ "${#active_pipelines[@]}" -eq 0 ]]; then
        log "Unable to reconcile an idle worker stop attempt after the start wait window."
        return 1
      fi

      sleep "${POLL_SECONDS}"
      continue
    fi

    sleep "${POLL_SECONDS}"
  done

  while true; do
    active_pipelines=()
    for pipeline_name in "${PIPELINE_NAMES[@]}"; do
      if pipeline_is_active "${pipeline_name}"; then
        active_pipelines+=("${pipeline_name}")
      fi
    done

    if [[ "${#active_pipelines[@]}" -eq 0 ]]; then
      if stop_worker_if_idle; then
        summary ""
        summary "- Final action: worker stopped after all monitored pipelines became idle."
        return 0
      fi

      active_pipelines=()
      for pipeline_name in "${PIPELINE_NAMES[@]}"; do
        if pipeline_is_active "${pipeline_name}"; then
          active_pipelines+=("${pipeline_name}")
        fi
      done

      if [[ "${#active_pipelines[@]}" -eq 0 ]]; then
        log "Unable to reconcile an idle worker stop attempt."
        return 1
      fi

      sleep "${POLL_SECONDS}"
      continue
    fi

    sleep "${POLL_SECONDS}"
  done
}

stop_mode() {
  log_snapshot
  if stop_worker_if_idle; then
    summary ""
    summary "- Final action: worker stop check completed."
  fi
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode)
        MODE="$2"
        shift 2
        ;;
      --pipelines)
        PIPELINE_NAMES_RAW="$2"
        shift 2
        ;;
      --project-tag)
        PROJECT_TAG="$2"
        shift 2
        ;;
      --service-tag)
        SERVICE_TAG="$2"
        shift 2
        ;;
      --region)
        REGION="$2"
        shift 2
        ;;
      --grace-seconds)
        GRACE_SECONDS="$2"
        shift 2
        ;;
      --start-wait-seconds)
        START_WAIT_SECONDS="$2"
        shift 2
        ;;
      --poll-seconds)
        POLL_SECONDS="$2"
        shift 2
        ;;
      --summary-file)
        SUMMARY_FILE="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done

  MODE="${MODE,,}"
  if [[ "${MODE}" != "monitor" && "${MODE}" != "stop" ]]; then
    echo "Invalid mode: ${MODE}" >&2
    usage >&2
    exit 1
  fi

  parse_pipeline_names
  if [[ "${#PIPELINE_NAMES[@]}" -eq 0 ]]; then
    echo "No pipeline names were configured." >&2
    exit 1
  fi

  if [[ "${MODE}" == "monitor" ]]; then
    monitor_mode
  else
    stop_mode
  fi
}

main "$@"
