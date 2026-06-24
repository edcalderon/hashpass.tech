# HashPass Agent Instructions

## Start Here

- Read `CLAUDE.md` before any release or Android deployment work.
- Treat `CLAUDE.md` as the source of truth for versioning, push order, and release flow.
- If `CLAUDE.md` and `README.md` differ, stop and ask before changing the release path.

## Deployment Command Contract

When the user says `deploy`, `release`, or `release patch`, complete the full production release unless the user limits the scope.

The full release includes:

1. Validate the current task changes.
2. Commit the intended changes on `develop`.
3. Push `develop` to `origin` and `upstream`.
4. Fast-forward or merge `develop` into `main`.
5. Run `npm run release:patch` on `main`.
6. Push `main` and the release tag to `origin`, then `upstream`.
7. Merge the release commit from `main` back into `develop`.
8. Push the synchronized `develop` branch to `origin` and `upstream`.
9. Trigger the Android release workflow from the new version tag.
10. Verify the Android workflow and the web deployment checks.

Do not report a deployment as complete while a required push, branch sync, release workflow, or deployment check is pending or failed.

## Versioning

- Never edit version numbers in `package.json`, `app.json`, or the mobile version files by hand.
- Use the release script for version bumps:
  - `npm run release:patch`
  - `npm run release:minor`
  - `npm run release:major`
- The release script is responsible for syncing version fields, creating the commit, tagging the release, and pushing `origin/main`.
- Never reuse or move an existing release tag.
- If the requested version already exists or its Android `versionCode` has shipped, create the next patch version.

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
- A completed release leaves `origin/main`, `origin/develop`, `upstream/main`, and `upstream/develop` at the same release commit.
