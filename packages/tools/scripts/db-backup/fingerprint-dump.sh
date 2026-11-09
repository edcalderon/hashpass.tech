#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "usage: fingerprint-dump.sh <custom-format-dump>" >&2
  exit 2
fi

# This SQL stream is only fingerprinted; it is never executed. A fixed restrict
# key makes pg_restore's output repeatable so identical database contents hash
# identically across scheduled runs.
pg_restore \
  --no-owner \
  --no-privileges \
  --restrict-key=hashpassfingerprintv1 \
  --file=- \
  "$1" \
  | sha256sum \
  | awk '{print $1}'
