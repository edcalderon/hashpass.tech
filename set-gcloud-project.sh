#!/bin/bash
<<<<<<< Updated upstream
=======
#!/bin/bash
>>>>>>> Stashed changes
# Source this file to set the correct gcloud project context
# Usage: source ./set-gcloud-project.sh

set -euo pipefail

<<<<<<< Updated upstream
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.gcloud"
KEY_FILE="${SCRIPT_DIR}/config/private-gcloud.json"
LOCAL_GCLOUD="${SCRIPT_DIR}/google-cloud-sdk/bin/gcloud"

_abort() {
  local msg="$1"
  echo "⚠️  ${msg}"
  # Support both sourced and executed usage.
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return 1
  fi
  exit 1
}
=======
ENV_FILE="./.env.gcloud"
>>>>>>> Stashed changes

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
else
<<<<<<< Updated upstream
  _abort "$ENV_FILE not found. Create it or copy from .env.gcloud template."
fi

if [[ ! -f "$KEY_FILE" ]]; then
  _abort "$KEY_FILE not found."
fi

# Always use the repository service-account key for this project context.
export GOOGLE_APPLICATION_CREDENTIALS="$KEY_FILE"

if command -v gcloud >/dev/null 2>&1; then
  GCLOUD_BIN="gcloud"
elif [[ -x "$LOCAL_GCLOUD" ]]; then
  GCLOUD_BIN="$LOCAL_GCLOUD"
else
  _abort "gcloud not found. Install Google Cloud SDK or keep ./google-cloud-sdk/bin/gcloud available."
fi

"$GCLOUD_BIN" auth activate-service-account "${CLOUDSDK_CORE_ACCOUNT}" \
  --key-file="$GOOGLE_APPLICATION_CREDENTIALS" \
  --project="${CLOUDSDK_CORE_PROJECT}" \
  --quiet >/dev/null

"$GCLOUD_BIN" config set account "${CLOUDSDK_CORE_ACCOUNT}" >/dev/null
"$GCLOUD_BIN" config set project "${CLOUDSDK_CORE_PROJECT}" >/dev/null

=======
  echo "⚠️  $ENV_FILE not found. Create it or copy from .env.gcloud template."
  return 1
fi

>>>>>>> Stashed changes
echo "✓ Switched to gcloud project: ${CLOUDSDK_CORE_PROJECT:-<unset>}"
echo "✓ Account: ${CLOUDSDK_CORE_ACCOUNT:-<unset>}"
echo "✓ Credentials: ${GOOGLE_APPLICATION_CREDENTIALS:-<unset>}"
echo ""
<<<<<<< Updated upstream
echo "Current project: $("$GCLOUD_BIN" config get-value project 2>/dev/null)"
echo "Active account: $("$GCLOUD_BIN" config get-value account 2>/dev/null)"
=======
echo "Current project: $(gcloud config get-value project 2>/dev/null)"
>>>>>>> Stashed changes
