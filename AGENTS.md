# HASHPASS Agent Instructions

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

## Browser Fetch And Test Tools

Use the installed browser tools for page fetches, responsive checks, and browser QA:

- Start with PinchTab for low-token page reads: `pinchtab daemon`, `pinchtab health`, `pinchtab nav <url>`, `pinchtab text`, and `pinchtab snap`.
- Use `browser-use` for autonomous multi-page form workflows. It is installed as a `uv` user tool; local Chrome control requires enabling `chrome://inspect/#remote-debugging`, or a trusted Browser Use Cloud / `BU_CDP_WS` target.
- Use `agent-browser` for auth-heavy flows, recordings, ref-based actions, and browser diagnostics. Run `agent-browser doctor`, then `agent-browser skills get core` for current instructions.

Do not put credentials, cookies, auth tokens, AWS account IDs, or private `.env` values in prompts, docs, screenshots, recordings, or logs.

## Deployment Command Contract

When the user says `deploy`, `release`, or `release patch`, complete the full production release unless the user limits the scope.

The full release includes:

1. Validate the current task changes.
2. Commit the intended changes on `develop`.
3. Push `develop` to `origin` and `upstream`.
4. Run `npm run release:promote` on `develop`. As of 2026-07-13 this also runs the real version bump and changelog, committing it as its own `chore: release vX.Y.Z` commit before opening the PR — the PR diff is the release, version bump included.
5. Wait for `@edcalderon` approval, and keep coverage at or above 33% with the GitHub security scans passing before merging the PR. `main` is enforced by an active GitHub ruleset (id `18627241`) — direct pushes to `main` are rejected, so this PR is the only way in.
6. Merge the PR. That is the last manual step. Do not run `npm run release:patch` on `main` and do not manually sync `develop` — `.github/workflows/release-tag-on-merge.yml` fires automatically on the merge and does both: tags the exact merge commit as `vX.Y.Z` (the version already bumped inside the PR, no second bump on `main`) and fast-forwards `develop` to match. Requires the `RELEASE_AUTOMATION_TOKEN` repo secret; the job fails loudly with a clear message if that secret is missing rather than silently degrading.
7. Do not trigger the Android release workflow manually. `.github/workflows/mobile-release-on-tag.yml` auto-dispatches `mobile-android-release.yml` on the `v*.*.*` tag push from step 6. Confirmed 2026-07-13: running `gh workflow run mobile-android-release.yml` after a merge creates a duplicate run racing the auto-triggered one for the same Android version code — only dispatch it manually for a retry on an already-tagged version or a non-default track/environment.
8. Verify the Android workflow and the web/API deployment checks, including the API version endpoint guard.
9. `upstream` (the personal-fork backup remote) is not synced by `release-tag-on-merge.yml` — no token available to that workflow can reach a different account's fork. Re-sync manually only if needed: `git push upstream develop <TAG_NAME>`.

Do not report a deployment as complete while a required push, branch sync, release workflow, or deployment check is pending or failed. See `.agents/active/task-release-flow-automation.md` (or `.agents/done/` once closed out) for the full design and incident history behind this flow.
Do not report the web deployment as complete if `https://api.hashpass.tech/api/config/versions` or `https://api-dev.hashpass.tech/api/config/versions` still reports an older version than the release.
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
