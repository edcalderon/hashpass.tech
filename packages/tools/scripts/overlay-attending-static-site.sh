#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET_DIRECTORY="${1:-}"

if [[ -z "${TARGET_DIRECTORY}" ]]; then
  echo "Usage: bash packages/tools/scripts/overlay-attending-static-site.sh <static-site-directory>" >&2
  exit 2
fi

cd "${ROOT_DIR}"
TARGET_DIRECTORY="$(cd "$(dirname "${TARGET_DIRECTORY}")" && pwd)/$(basename "${TARGET_DIRECTORY}")"

# Reuse the public build settings already provided to the Expo site pipelines.
# Environment-specific NEXT_PUBLIC_* values may override these defaults.
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-${EXPO_PUBLIC_SUPABASE_URL:-${EXPO_PUBLIC_SUPABASE_URL_PROD:-}}}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${EXPO_PUBLIC_SUPABASE_ANON_KEY:-${EXPO_PUBLIC_SUPABASE_KEY:-${EXPO_PUBLIC_SUPABASE_KEY_PROD:-}}}}"
export NEXT_PUBLIC_LINKS_API_BASE_URL="${NEXT_PUBLIC_LINKS_API_BASE_URL:-${EXPO_PUBLIC_LINKS_API_BASE_URL:-${EXPO_PUBLIC_LINKS_API_BASE_URL_PROD:-}}}"
# The BSL deployment passes this explicitly; the general site clears it so
# both builds cannot accidentally share the BSL-only landing content.
export NEXT_PUBLIC_ATTENDING_SITE_EVENT_SLUG="${ATTENDING_SITE_EVENT_SLUG:-}"
# The Club Pages deployment has a separate home link; tenant overlays always
# clear it so BSL and the generic attending host use their own destinations.
export NEXT_PUBLIC_ATTENDING_SITE_HOME_URL="${ATTENDING_SITE_HOME_URL:-}"

corepack pnpm --filter hashpass-club-web build

ATTENDING_EXPORT="${ROOT_DIR}/apps/web-app/out"
for required_file in \
  "${ATTENDING_EXPORT}/attending/index.html" \
  "${ATTENDING_EXPORT}/attending/bsl/index.html" \
  "${ATTENDING_EXPORT}/canonical-redirect.js" \
  "${ATTENDING_EXPORT}/theme-init.js" \
  "${ATTENDING_EXPORT}/sw-register.js" \
  "${ATTENDING_EXPORT}/logo-full-hashpass-white-cyan.svg" \
  "${ATTENDING_EXPORT}/logo-full-hashpass-black-cyan.svg"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Missing attending export output: ${required_file}" >&2
    exit 1
  fi
done

mkdir -p "${TARGET_DIRECTORY}/attending" "${TARGET_DIRECTORY}/_next"
cp -R "${ATTENDING_EXPORT}/attending/." "${TARGET_DIRECTORY}/attending/"
cp -R "${ATTENDING_EXPORT}/_next/." "${TARGET_DIRECTORY}/_next/"
cp "${ATTENDING_EXPORT}/canonical-redirect.js" "${TARGET_DIRECTORY}/canonical-redirect.js"
cp "${ATTENDING_EXPORT}/theme-init.js" "${TARGET_DIRECTORY}/theme-init.js"
cp "${ATTENDING_EXPORT}/sw-register.js" "${TARGET_DIRECTORY}/sw-register.js"
# The shared Club footer switches between these root-relative variants by
# theme. Copy both into tenant overlays so they resolve on bsl.hashpass.tech.
cp "${ATTENDING_EXPORT}/logo-full-hashpass-white-cyan.svg" "${TARGET_DIRECTORY}/logo-full-hashpass-white-cyan.svg"
cp "${ATTENDING_EXPORT}/logo-full-hashpass-black-cyan.svg" "${TARGET_DIRECTORY}/logo-full-hashpass-black-cyan.svg"

echo "Attending artwork routes overlaid into ${TARGET_DIRECTORY}"
