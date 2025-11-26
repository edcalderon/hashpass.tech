#!/bin/bash

# Script wrapper to run Node.js scripts with increased memory limit
# Usage: ./scripts/run-with-more-memory.sh <script-path> [args...]

SCRIPT_PATH="$1"
shift

if [ -z "$SCRIPT_PATH" ]; then
  echo "Usage: $0 <script-path> [args...]"
  exit 1
fi

# Increase Node.js memory limit to 8GB (adjust as needed)
# Default Node.js limit is usually around 2GB
NODE_OPTIONS="--max-old-space-size=8192" node "$SCRIPT_PATH" "$@"




















