# Archived Amplify Assets

This folder is read-only historical reference for the retired Amplify-based
deployment path.

## What is here

- `config/` - frozen Amplify build specifications that are no longer deployed
- `scripts/` - legacy helper scripts that managed the old Amplify app and
  Lambda release flow, including utility helpers under `scripts/util/`
- `docs/` - historical Amplify docs that were removed from the active docs site

## Status

- Deprecated: yes
- Source of truth for active deployments: no
- Safe to use for reference only

Active web deployment, worker control, and DNS routing now live under the
target-account pipeline stack and GitHub Actions workflows.
