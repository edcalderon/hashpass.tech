#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/.site-artifacts/club-docs"

cd "$ROOT_DIR"

rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/documentation"

CI=1 pnpm --dir apps/web-app build
CI=1 HASHPASS_DOCS_URL=https://hashpass.club HASHPASS_DOCS_BASE_URL=/documentation/ pnpm --dir apps/docs build

cp -R apps/web-app/out/. "$ARTIFACT_DIR"/
cp -R apps/docs/build/. "$ARTIFACT_DIR/documentation"/
