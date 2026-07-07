# HashPass Agent Instructions

## Start Here

- Read `CLAUDE.md` before any release or Android deployment work.
- Treat `CLAUDE.md` as the source of truth for versioning, push order, and release flow.
- If `CLAUDE.md` and `README.md` differ, stop and ask before changing the release path.

## Codebase Memory MCP

Use `codebase-memory-mcp` first for repo discovery and fast checks.

- Start with `codebase-memory-mcp cli list_projects` and `codebase-memory-mcp cli index_status`.
- Prefer `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, and `get_architecture` before opening many files or running broad grep.
- Use `search_code`, `rg`, or direct file reads only for literals, config values, generated files, or when the graph has already narrowed the target.
- If the project is missing or stale, re-index `/home/ed/Documents/HASH/hashpass.tech` and then repeat the graph search.

## Deployment Command Contract

When the user says `deploy`, `release`, or `release patch`, complete the full production release unless the user limits the scope.

The full release includes:

1. Validate the current task changes.
2. Commit the intended changes on `develop`.
3. Push `develop` to `origin` and `upstream`.
4. Run `npm run release:promote` on `develop`.
5. Wait for `@edcalderon` codeowner approval, coverage at or above 33%, and the GitHub security scans before merging the PR.
6. Merge the PR and sync the release commit back to `develop`.
7. Push the synchronized `develop` branch to `origin` and `upstream`.
8. Run `npm run release:patch` on `main` to cut the stable tag.
9. Trigger the Android release workflow from the new version tag.
10. Verify the Android workflow and the web deployment checks.

Do not report a deployment as complete while a required push, branch sync, release workflow, or deployment check is pending or failed.
Do not hand-edit release artifacts or perform a release by hand; the release scripts own the version bump, changelog, README sync, tag, and push sequence.
The Husky pre-commit hook runs the README sync guard, so a stale changelog/README pair should be fixed with `npm run update-readme` before committing.

## Versioning

- Never edit version numbers in `package.json`, `app.json`, or the mobile version files by hand.
- Never hand-edit `CHANGELOG.md` or the README latest-changes section to force a release. Use the repo release scripts and README sync guard instead.
- Use the release script for version bumps:
  - `npm run release:patch`
  - `npm run release:minor`
  - `npm run release:major`
- The release script is responsible for syncing version fields, creating the commit, tagging the release, and pushing the release branch.
- `npm run release:promote` prepares the protected `develop -> main` PR instead of direct-pushing to `main`.
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
