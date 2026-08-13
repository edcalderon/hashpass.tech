#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-2}}"
PIPELINE_NAMES_RAW="${WEB_PIPELINE_NAMES:-hashpass-dev-site,hashpass-production-site}"
PROJECT_TAG="${WEB_PIPELINE_PROJECT_TAG:-hashpass}"
SERVICE_TAG="${WEB_PIPELINE_SERVICE_TAG:-pipeline-build-worker}"
# The web pipelines have separate workers so development builds cannot delay
# production. AWS accepts a comma-separated Values list for the tag filter.
PROVIDER_TAG="${WEB_PIPELINE_PROVIDER_TAGS:-hashpass-prod-ec2-build,hashpass-dev-ec2-build}"
GRACE_SECONDS="${WEB_PIPELINE_GRACE_SECONDS:-30}"
START_WAIT_SECONDS="${WEB_PIPELINE_START_WAIT_SECONDS:-180}"
POLL_SECONDS="${WEB_PIPELINE_POLL_SECONDS:-20}"
ORPHAN_GRACE_SECONDS="${WEB_PIPELINE_ORPHAN_GRACE_SECONDS:-600}"
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
Usage: manage-web-pipeline-worker.sh [--mode monitor|stop|reconcile] [--pipelines name1,name2] [--region us-east-2]

Environment variables:
  WEB_PIPELINE_NAMES
  WEB_PIPELINE_PROJECT_TAG
  WEB_PIPELINE_SERVICE_TAG
  WEB_PIPELINE_PROVIDER_TAGS
  WEB_PIPELINE_GRACE_SECONDS
  WEB_PIPELINE_START_WAIT_SECONDS
  WEB_PIPELINE_POLL_SECONDS
  WEB_PIPELINE_ORPHAN_GRACE_SECONDS
EOF
}

worker_instance_ids() {
  aws ec2 describe-instances \
    --region "${REGION}" \
    --filters \
      "Name=tag:Project,Values=${PROJECT_TAG}" \
      "Name=tag:Service,Values=${SERVICE_TAG}" \
      "Name=tag:Provider,Values=${PROVIDER_TAG}" \
      "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --output json \
    | jq -r '.Reservations[]?.Instances[]?.InstanceId'
}

running_worker_instance_ids() {
  aws ec2 describe-instances \
    --region "${REGION}" \
    --filters \
      "Name=tag:Project,Values=${PROJECT_TAG}" \
      "Name=tag:Service,Values=${SERVICE_TAG}" \
      "Name=tag:Provider,Values=${PROVIDER_TAG}" \
      "Name=instance-state-name,Values=pending,running" \
    --output json \
    | jq -r '.Reservations[]?.Instances[]?.InstanceId'
}

worker_instance_report() {
  aws ec2 describe-instances \
    --region "${REGION}" \
    --filters \
      "Name=tag:Project,Values=${PROJECT_TAG}" \
      "Name=tag:Service,Values=${SERVICE_TAG}" \
      "Name=tag:Provider,Values=${PROVIDER_TAG}" \
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

latest_pipeline_execution_report() {
  local pipeline_name="$1"

  aws codepipeline list-pipeline-executions \
    --region "${REGION}" \
    --pipeline-name "${pipeline_name}" \
    --max-results 1 \
    --output json \
    | jq -r '
      .pipelineExecutionSummaries[0]? |
      [
        .pipelineExecutionId,
        .status,
        (.lastUpdateTime // .startTime // "")
      ] | @tsv
    '
}

assert_pipelines_succeeded() {
  local pipeline_name execution_id status updated_at
  local failed=0

  for pipeline_name in "${PIPELINE_NAMES[@]}"; do
    execution_id=""
    status=""
    updated_at=""

    while IFS=$'\t' read -r execution_id status updated_at; do
      break
    done < <(latest_pipeline_execution_report "${pipeline_name}")

    if [[ -z "${execution_id}" || -z "${status}" ]]; then
      log "Pipeline ${pipeline_name} has no execution summary."
      failed=1
      continue
    fi

    log "Pipeline ${pipeline_name} latest execution ${execution_id}: ${status}${updated_at:+ at ${updated_at}}"
    summary "- ${pipeline_name}: ${status} (${execution_id})"

    if [[ "${status}" != "Succeeded" ]]; then
      failed=1
    fi
  done

  [[ "${failed}" -eq 0 ]]
}

log_snapshot() {
  local pipeline_name

  summary "## HashPass Web Pipeline Monitor"
  summary ""
  summary "- Region: ${REGION}"
  summary "- Pipelines: ${PIPELINE_NAMES[*]}"
  summary "- Worker tag filter: Project=${PROJECT_TAG}, Service=${SERVICE_TAG}, Provider=${PROVIDER_TAG}"
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
    log "No EC2 worker instances matched Project=${PROJECT_TAG}, Service=${SERVICE_TAG}, Provider=${PROVIDER_TAG}; nothing to stop."
    return 0
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
    log "No EC2 worker instances matched Project=${PROJECT_TAG}, Service=${SERVICE_TAG}, Provider=${PROVIDER_TAG}."
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

running_worker_count() {
  running_worker_instance_ids | while IFS= read -r instance_id; do
    [[ -n "${instance_id}" ]] && printf '%s\n' "${instance_id}"
  done | wc -l
}

provider_is_configured() {
  local provider="$1"
  local configured

  IFS=',' read -r -a configured_providers <<< "${PROVIDER_TAG}"
  for configured in "${configured_providers[@]}"; do
    [[ "$(trim_value "${configured}")" == "${provider}" ]] && return 0
  done

  return 1
}

reconcile_orphaned_pipeline() {
  local pipeline_name="$1"
  local pipeline_json state_json action_info owner provider status execution_id changed_at changed_epoch now age

  pipeline_json="$(aws codepipeline get-pipeline \
    --region "${REGION}" \
    --name "${pipeline_name}" \
    --output json)"
  owner="$(jq -r '.pipeline.stages[]?.actions[]? | select(.name == "BuildSite" or .name == "DeployInfra") | .actionTypeId.owner' <<<"${pipeline_json}" | head -n 1)"
  provider="$(jq -r '.pipeline.stages[]?.actions[]? | select(.name == "BuildSite" or .name == "DeployInfra") | .actionTypeId.provider' <<<"${pipeline_json}" | head -n 1)"

  if [[ "${owner}" != "Custom" ]] || ! provider_is_configured "${provider}"; then
    log "${pipeline_name} uses ${owner:-unknown}/${provider:-unknown}; no legacy EC2 action to reconcile."
    return 0
  fi

  state_json="$(aws codepipeline get-pipeline-state \
    --region "${REGION}" \
    --name "${pipeline_name}" \
    --output json)"
  action_info="$(jq -r '
    .stageStates[] as $stage
    | $stage.actionStates[]?
    | select((.actionName == "BuildSite" or .actionName == "DeployInfra") and
             (.latestExecution.status == "InProgress" or .latestExecution.status == "Queued"))
    | [($stage.latestExecution.pipelineExecutionId // ""), (.latestExecution.status // ""), (.latestExecution.lastStatusChange // "")]
    | @tsv
  ' <<<"${state_json}" | head -n 1)"

  [[ -n "${action_info}" ]] || return 0
  IFS=$'\t' read -r execution_id status changed_at <<< "${action_info}"
  [[ -n "${execution_id}" && -n "${changed_at}" ]] || return 0

  if [[ "$(running_worker_count)" -gt 0 ]]; then
    log "${pipeline_name} has an active ${provider} action and a running worker; leaving it alone."
    return 0
  fi

  changed_epoch="$(date -d "${changed_at}" +%s)"
  now="$(date +%s)"
  age=$((now - changed_epoch))
  if (( age < ORPHAN_GRACE_SECONDS )); then
    log "${pipeline_name} has no worker, but its ${status} action is only ${age}s old; waiting for the grace period."
    return 0
  fi

  log "Stopping orphaned ${pipeline_name} execution ${execution_id}: custom action ${provider} has no running worker after ${age}s."
  aws codepipeline stop-pipeline-execution \
    --region "${REGION}" \
    --pipeline-name "${pipeline_name}" \
    --pipeline-execution-id "${execution_id}" \
    --abandon \
    --reason "orphaned legacy EC2 action ${provider}: no running worker after ${age}s; CodeBuild is the primary executor" \
    >/dev/null
  summary "- Stopped orphaned ${pipeline_name} execution ${execution_id} (${provider}); no EC2 worker was running."
}

reconcile_mode() {
  local pipeline_name

  for pipeline_name in "${PIPELINE_NAMES[@]}"; do
    reconcile_orphaned_pipeline "${pipeline_name}"
  done
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
        return 0
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
      pipeline_success="true"
      assert_pipelines_succeeded || pipeline_success="false"

      if stop_worker_if_idle; then
        summary ""
        summary "- Final action: worker stopped after all monitored pipelines became idle."
        if [[ "${pipeline_success}" != "true" ]]; then
          log "One or more monitored pipelines did not finish successfully."
          return 1
        fi
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
      --provider-tag)
        PROVIDER_TAG="$2"
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
      --orphan-grace-seconds)
        ORPHAN_GRACE_SECONDS="$2"
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
  if [[ "${MODE}" != "monitor" && "${MODE}" != "stop" && "${MODE}" != "reconcile" ]]; then
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
  elif [[ "${MODE}" == "stop" ]]; then
    stop_mode
  else
    reconcile_mode
  fi
}

main "$@"
