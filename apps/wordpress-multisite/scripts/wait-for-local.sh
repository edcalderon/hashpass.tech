#!/usr/bin/env bash
set -euo pipefail

url=http://127.0.0.1:8088/wp-login.php
deadline=$((SECONDS + 120))

until curl --silent --fail --output /dev/null "$url"; do
  if (( SECONDS >= deadline )); then
    echo "WordPress did not become ready at $url within 120 seconds." >&2
    exit 1
  fi
  sleep 2
done
