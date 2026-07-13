# Release Workflow

## Canonical Order — Follow This Exactly, Don't Skip Ahead

**Updated 2026-07-13: steps 4-6 below are now automatic.** This is the one
sequence that matters. Every step in this doc below expands on one of these
— but the ordering itself, and never skipping a step, is what actually
prevents releases from going out inconsistent. **The mistake made on
2026-07-08 that prompted writing this section explicitly: the mobile
Android workflow was dispatched from a release tag *before* the promotion
PR carrying a doc-only commit had been merged** — the tag itself was fine
(created from `main` after the *first* promotion PR merged), but a second,
smaller PR was left open and forgotten while later steps proceeded. Nothing
broke, but it violated the intended order and had to be caught after the
fact. This is exactly the class of mistake automating steps 4-6 removes —
a step that should be structurally impossible to get wrong no longer
depends on a human remembering to do it correctly. See
`.agents/active/task-release-flow-automation.md` (or `.agents/done/` once
closed out) for the full design.

1. **Work on `develop`.** Commit and push everything there first — code, docs, config, everything.
2. **Open the promotion PR:** `npm run release:promote` (develop → main). This now also runs the real version bump and changelog, committing it as its own `chore: release vX.Y.Z` commit before the PR opens — the PR *is* the release, version bump included, not a preview of one.
3. **Merge that PR before doing anything else.** Do not proceed while any promotion PR for this release is still open — even a trivial doc-only one opened as a follow-up. Check with `gh pr view <N> --json state,mergedAt` if there's any doubt. If a second small PR gets opened after the first because of edits made after the promote ran, merge that one too before moving on — don't accumulate open PRs across steps.
4. **That's the last manual step.** `.github/workflows/release-tag-on-merge.yml` fires automatically on the merge: it tags the exact merge commit as `vX.Y.Z` (the version already bumped inside the PR — no second bump happens on `main`) and fast-forwards `develop` to match, in one push. Do not run `npm run release:patch` on `main` and do not manually sync `develop` — both are now handled for you. If this job fails, it comments directly on the merged PR; check there first.
5. **Verify `develop` and `main` actually match, and that production reflects it.** At minimum: `git log main..develop` and `git log develop..main` should both be empty; hit the live production API directly (e.g. `curl https://api.hashpass.tech/api/auth/get-session`) to confirm the deploy that's supposed to have gone out actually did, rather than assuming a push to `main` means production is now correct.
6. **Android release fires on its own too** — the tag push from step 4 triggers `mobile-release-on-tag.yml`, which dispatches `mobile-android-release.yml`. Verify it picked up with `gh run list --repo hashpass-tech/hashpass.tech --workflow mobile-android-release.yml --limit 3`; only dispatch it manually for a retry or a non-default track (see Android Release below) — a manual dispatch after a normal merge creates a duplicate run racing the auto-triggered one for the same Play Console version code (confirmed 2026-07-13).

## The Golden Rule: Never Manually Edit Version Numbers

All version fields (`package.json`, `app.json`, `apps/mobile-app/config/version.ts`, Android `versionCode`, etc.) must stay in sync. The release scripts handle this automatically. Manual edits cause version skipping and ordering bugs.

## Protected Release Promotion

The repository now treats `develop` as the only release source branch. Promotion to `main` is PR-only.

### What changed

- `npm run release:promote` opens a GitHub PR from `develop` to `main` carrying the code changes **and**, as of 2026-07-13, the version bump/changelog as its own commit — the PR diff is the full release, nothing left to bump after merge.
- Release PRs currently require `@edcalderon` approval (the ruleset's `require_code_owner_review` is `false` today, so technically any approving review satisfies it — revisit if that matters).
- Release PRs must pass the coverage gate and GitHub security scans before merge.
- **`main` is genuinely branch-protected as of 2026-07-13.** The `MAIN` ruleset (id `18627241`) existed since 2026-07-07 but had `enforcement: disabled` until then — direct pushes to `main`, including `release:patch`'s old version-bump/changelog/tag commit, succeeded with no rejection the whole time despite this doc previously saying otherwise. It's active now: any direct push to `main` is rejected, code changes must go through the promotion PR, full stop. `npm run release:patch` is no longer run on `main` as part of the normal flow — see "Cut the stable release" below.
- If you're ever unsure whether a given push to `main` will be accepted, the safe way to find out is to just run the actual `npm run release:*` command — don't hand-rewrite what it would do with raw `git`/`gh` commands to "test" the protection first.

### Required checks before merge

- Coverage must be at or above 33%
- CodeQL or the repository security scan must pass
- The release PR must come from `develop`, not a feature branch or stale branch

## Web Release (hashpass.tech + dev.hashpass.tech)

The web app deploys through the target-account pipeline and CloudFront front door. When a merged release lands on `main`:

1. GitHub Actions runs the target-account web checks and deploy orchestration.
2. The target pipeline rebuilds and publishes `hashpass.tech` and `dev.hashpass.tech`.
3. The deploy helper packages the Expo Router API and updates the matching Lambda:
   - `main` updates `hashpass-prod-expo-router-api`
   - `develop` updates `hashpass-dev-expo-router-api`
4. The deploy helper verifies `/api/config/versions` against the release version. A stale API version fails the deploy.
5. The GitHub `Deploy Infra` workflow switches to the target-account `AWS_WEB_PIPELINE_ROLE_ARN` and runs the same API Lambda update as a release safety net after the SST deploy attempt:
   - `main` runs `packages/tools/scripts/deploy-api-lambda.sh` for `hashpass-prod-expo-router-api`
   - `develop` runs `packages/tools/scripts/deploy-api-lambda.sh` for `hashpass-dev-expo-router-api`
   - `packages/tools/scripts/deploy-api-lambda.sh` builds a fresh Expo API bundle when the local export is missing or stale.
   - `packages/tools/scripts/package-lambda.sh` rejects stale local Expo server exports before a Lambda zip can be uploaded.
   - The SST BSL static deploy is best-effort in this workflow because `bsl.hashpass.tech` also deploys through SST Console; the API Lambda update and version verification stay hard-failing.

Both paths are automatic and typically take a few minutes. A release is not complete until `https://api.hashpass.tech/api/config/versions` and `https://api-dev.hashpass.tech/api/config/versions` both report the release version.

Legacy Amplify start-job instructions are archived in `archive/amplify/README.md` for historical reference only.

## Android Release

For the Play Console track ladder and the future production publishing checklist, see [PLAY_CONSOLE_RELEASE_FLOW.md](./PLAY_CONSOLE_RELEASE_FLOW.md).

Temporary release posture: while the app is under active development, keep Android releases on the development profile. Use the internal preview step first, then alpha on the same tag after internal succeeds. Closed testing can go out with `release_status=completed`; only the first alpha upload needs `draft` if Play still treats the app as a draft. Production dispatches are paused until the release freeze is lifted.

Follow this sequence exactly. Order matters.

### Step 1 — Work on `develop`

Create and validate the change on `develop`. Do not branch release work from a stale feature branch.

For Android-impacting changes, run the local bundle preflight in [Android CI Memory And Local Bundle Checks](../../infra/ANDROID_CI_MEMORY.md#local-android-bundle-preflight) before opening the promotion PR. This catches `:app:createBundleReleaseJsAndAssets` failures, including Metro `async-require.js` and pnpm virtual-store SHA-1 errors, before the EC2 runner spends a release attempt.

### Step 2 — Prepare the promotion PR

Use the promotion command on `develop` so the release-prep commit and protected PR stay in one flow:

```bash
npm run release:promote   # develop -> main PR prep
```

This script:

- Commits any unrelated dirty/untracked files first, as its own commit
- Runs the real version bump and changelog write, and commits that as its own `chore: release vX.Y.Z` commit — as of 2026-07-13 this is real, not a prediction: `package.json`, `CHANGELOG.md`, and the rest are already bumped by the time the PR opens
- Pushes the release branch to `origin` and `upstream`
- Opens the protected `develop -> main` PR

`npm run release:patch -- --promote` is the same promotion prep path if you prefer to call the release script directly. Pass `--skip-version-bump` to fall back to the old predict-only behavior (PR title shows a predicted version, no actual bump happens) if you need it for some reason.

**If the version bump step fails with "Changelog entry vX.Y.Z has no documented changes"**, that means every commit since the last release was something the changelog tool doesn't consider release-worthy (e.g. doc-only or task-file commits with no conventional-commit type it recognizes) — this is a deliberate guard against shipping an empty release, not a bug. Add a real change or use `--skip-version-bump` if you specifically want to promote without one.

If the PR-creation step itself fails on something transient (seen 2026-07-08: `gh pr create` returning `HTTP 502: 502 Bad Gateway`), re-run `npm run release:promote` again rather than hand-issuing the `gh pr create` command it logged — check `git log`/`git status` first to confirm the commit+push already succeeded so you don't duplicate them, but let the script redo the PR-creation call itself.

The PR body should make the actual release contents obvious:

- Auto-generated release summary pulled from the version metadata / changelog first
- Auto-generated implementation bullets for docs, release tooling, and sync changes
- Changed files folded into a collapsible details block for support/debugging
- Release version, base version, release commit, and source branch
- Protected `develop -> main` path reminder

### Step 3 — Merge the release PR

Merge the PR after the branch protection checks pass. That's the last manual step in the whole flow.

### Step 4 — Tag and sync happen automatically

`.github/workflows/release-tag-on-merge.yml` fires the moment the PR merges:

- Tags `github.event.pull_request.merge_commit_sha` as `vX.Y.Z`, reading the version already bumped inside the PR (no second bump happens on `main` — `npm run release:patch` is not part of the normal flow anymore)
- Pushes the tag to `origin`
- Fast-forwards `develop` to the same commit and pushes it to `origin`
- Comments on the merged PR directly if anything fails, rather than only showing a red X in the Actions tab

This requires the `RELEASE_AUTOMATION_TOKEN` repo secret (a fine-grained PAT scoped to this repo only, "Contents: Read and write" permission). It's needed instead of the default `GITHUB_TOKEN` because GitHub does not let the default token's pushes trigger other workflows — using it here would have silently broken `mobile-release-on-tag.yml`'s tag-push trigger and `infra-deploy.yml`'s `develop`-push trigger. If the secret is missing, the workflow fails loudly at a preflight step instead of silently degrading.

**`npm run release:patch` still exists and still works as a manual fallback** if this workflow needs to be bypassed for some reason — run it from the `main` worktree exactly as before (see the worktree note below) — but it will fail its own `git push origin main` unless you're also bypassing the now-active `MAIN` ruleset somehow, since that push goes directly to a genuinely protected branch. Treat it as an emergency path, not the normal one.

If you keep `main` checked out in a separate git worktree (common local setup here — `hashpass.tech-main` alongside the primary `hashpass.tech` checkout on `develop`), run any manual `main`-branch command from that worktree directly. `git checkout main` will fail with `'main' is already used by worktree at ...` if you try to switch to it from the `develop` checkout — that's not an error to work around, it just means you should `cd` into the other worktree (or use `git -C <path> ...` for individual commands) instead of trying to check out `main` in place.

### Step 5 — Android CI triggers itself

**This already happened by the time you read this** — the tag push from Step 4 fires `mobile-release-on-tag.yml`, which dispatches `mobile-android-release.yml` with the exact fields below automatically. Verify it picked up: `gh run list --repo hashpass-tech/hashpass.tech --workflow mobile-android-release.yml --limit 3`. The manual command below is only for a retry on an already-tagged version, or a non-default track/environment — running it after a normal merge creates a duplicate run racing the auto-triggered one for the same Play Console version code (confirmed 2026-07-13, had to cancel the duplicate).

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=development \
  --field track=internal \
  --field auto_promote_alpha=true \
  --field alpha_release_status=completed \
  --field backend=fastlane \
  --field runner=aws-ec2
```

This builds a signed AAB on the EC2 runner and submits it to Play via Fastlane on the development profile.

Use `environment=development` with `track=internal` for the first pass.

Add `auto_promote_alpha=true` and keep `alpha_release_status=completed` to have the workflow dispatch and publish the matching alpha run automatically after the internal release succeeds. Use `alpha_release_status=draft` only if Play Console still rejects completed alpha releases because the app itself is in draft.

Expo prebuild enables Android release minification, so Gradle emits a `mapping.txt` file for release builds. The Fastlane lane uploads any Play deobfuscation files it finds in the Android build outputs, such as `mapping.txt` or `native-debug-symbols.zip`, so crash traces stay readable in Play Console. This only applies to builds created after this change; any older draft artifacts stay without deobfuscation until a new build is uploaded.

For the first closed-testing release, rerun the same tag with `environment=development`, `track=alpha`, and keep the release status at `completed` unless Play Console still reports the app as a draft:

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=development \
  --field track=alpha \
  --field release_status=completed \
  --field backend=fastlane \
  --field runner=aws-ec2
```

The workflow track input maps directly to Play Console tracks. `internal` is the first pass, `alpha` is the closed-testing path requested for Play review prep, and production is paused until the freeze lifts. `release_status` and `alpha_release_status` default to `completed`; keep them completed so Play publishes without manual draft review.

If you want one-step promotion, keep the first dispatch on `track=internal` and set `auto_promote_alpha=true`; the workflow will queue the alpha release for the same tag after internal succeeds.

The workflow also matches Expo build credentials by the `ANDROID_UPLOAD_KEY_SHA1` repository variable before exporting the keystore to Fastlane.

### Step 6 — Back up to the personal fork

`release-tag-on-merge.yml` does not do this for you — no token available to that workflow can authenticate to a different account's fork. Run manually if the backup mirror needs to catch up:

```bash
git push upstream develop v<NEW_VERSION>
```

Where `upstream` = `edcalderon/hashpass.tech`.

## Repository Remotes

| Remote | Repo | Purpose |
|--------|------|---------|
| `origin` | `hashpass-tech/hashpass.tech` | Primary - CI/CD runs from here |
| `upstream` | `edcalderon/hashpass.tech` | Personal backup |

Always push to `origin` first. Push to `upstream` after the release tag is created and the release branch has been synchronized.

## Versioning Scheme

Versions follow `MAJOR.MINOR.PATCH` (semver) and `versionCode` is derived from the version (e.g., v1.8.76 → versionCode 10876). The release script calculates `versionCode` automatically.

## What Gets Rebuilt on Each Release

| What | When rebuilt | Where |
|------|-------------|-------|
| Web static bundle | Every target web release | `hashpass.tech`, `dev.hashpass.tech` |
| Lambda API routes | Every target web/API deploy | `api.hashpass.tech`, `api-dev.hashpass.tech` |
| Android APK/AAB | Auto-triggered on release tag push (manual dispatch only for retries/non-default tracks) | Play Store |

The Lambda environment variables (secrets, Supabase keys, etc.) are **not** updated by a static deploy. Update them with `node packages/tools/scripts/sync-env.js production --tenant core` or the AWS Lambda console before releasing if secrets changed.
