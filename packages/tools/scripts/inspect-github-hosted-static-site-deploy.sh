#!/usr/bin/env bash
set -euo pipefail

# Read-only operator view for the GitHub-hosted static-site rollout. It never
# requests AWS credentials and remains useful while the AWS fallback is manual.

REPOSITORY="${GITHUB_REPOSITORY:-hashpass-tech/hashpass.tech}"
WORKFLOW_FILE="github-hosted-static-site-deploy.yml"
LIMIT=10

usage() {
  cat <<'EOF'
Usage: inspect-github-hosted-static-site-deploy.sh [--repo owner/repo] [--limit 1..100]

Shows the current registration state and recent GitHub Actions runs for the
GitHub-hosted static-site workflow. Authentication is read-only through gh.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPOSITORY="${2:-}"
      shift 2
      ;;
    --limit)
      LIMIT="${2:-}"
      shift 2
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

if [[ ! "${REPOSITORY}" =~ ^[^/[:space:]]+/[^/[:space:]]+$ ]]; then
  echo "ERROR: --repo must be owner/repository." >&2
  exit 2
fi

if [[ ! "${LIMIT}" =~ ^[1-9][0-9]?$|^100$ ]]; then
  echo "ERROR: --limit must be between 1 and 100." >&2
  exit 2
fi

workflow_id=""
if ! workflow_id="$(gh api "repos/${REPOSITORY}/actions/workflows/${WORKFLOW_FILE}" --jq .id 2>/dev/null)"; then
  echo "Workflow ${WORKFLOW_FILE} is not registered on ${REPOSITORY}'s default branch yet."
  echo "No GitHub-hosted test is possible until the protected release path promotes this workflow."
  exit 3
fi

echo "GitHub-hosted static-site workflow: ${REPOSITORY}/${WORKFLOW_FILE}"
echo "Recent runs (status, conclusion, commit, created, updated, URL):"
gh api "repos/${REPOSITORY}/actions/workflows/${workflow_id}/runs?per_page=${LIMIT}" \
  --jq '.workflow_runs[] | [.status, (.conclusion // "-"), .head_sha, .created_at, .updated_at, .html_url] | @tsv'
