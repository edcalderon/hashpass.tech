# Shared scripts

Shared build/deploy scripts used across apps in the monorepo.

Use `tools/scripts/` as the primary location for app-specific and Lambda/deploy scripts (e.g. `package-lambda.sh`, `update-sw-version.mjs`). Reference these from root or app-level scripts as needed.
