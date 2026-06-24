# HashPass Agent Instructions

## Start Here

- Read `CLAUDE.md` before any release or Android deployment work.
- Treat `CLAUDE.md` as the source of truth for versioning, push order, and release flow.
- If `CLAUDE.md` and `README.md` differ, stop and ask before changing the release path.

## Versioning

- Never edit version numbers in `package.json`, `app.json`, or the mobile version files by hand.
- Use the release script for version bumps:
  - `npm run release:patch`
  - `npm run release:minor`
  - `npm run release:major`
- The release script is responsible for syncing version fields, creating the commit, tagging the release, and pushing `origin/main`.

## Android Release Flow

1. Make and validate the code change.
2. Run the release script for the new version.
3. Trigger `.github/workflows/mobile-android-release.yml` with the version tag created by the release script.
4. Use the workflow inputs documented in `CLAUDE.md` and keep the backend, environment, and runner consistent with the release target.
5. After the release, sync `develop` with `main`.
6. Push to `origin` first, then push to `upstream` as backup.

## Push Rules

- `origin` is the primary CI/CD remote.
- `upstream` is the backup fork.
- Do not skip the `develop` sync after a release.
