# Release Workflow

## Canonical Order — Follow This Exactly, Don't Skip Ahead

This is the one sequence that matters. Every step in this doc below expands
on one of these — but the ordering itself, and never skipping a step, is
what actually prevents releases from going out inconsistent. **The mistake
made on 2026-07-08 that prompted writing this section explicitly: the
mobile Android workflow was dispatched from a release tag *before* the
promotion PR carrying a doc-only commit had been merged** — the tag itself
was fine (created from `main` after the *first* promotion PR merged), but
a second, smaller PR was left open and forgotten while later steps
proceeded. Nothing broke, but it violated the intended order and had to be
caught after the fact. Don't let that happen again:

1. **Work on `develop`.** Commit and push everything there first — code, docs, config, everything.
2. **Open the promotion PR:** `npm run release:promote` (develop → main).
3. **Merge that PR before doing anything else.** Do not proceed to step 4, and *especially* do not dispatch the mobile workflow, while any promotion PR for this release is still open — even a trivial doc-only one opened as a follow-up. Check with `gh pr view <N> --json state,mergedAt` if there's any doubt. If a second small PR gets opened after the first because of edits made after the promote ran, merge that one too before moving on — don't accumulate open PRs across steps.
4. **Cut the stable release on `main`:** `npm run release:patch`, run on `main` (see the worktree note below if `main` lives in a separate checkout).
5. **Verify `develop` and `main` actually match, and that production reflects it.** At minimum: `git log main..develop` and `git log develop..main` should both be empty after syncing; hit the live production API directly (e.g. `curl https://api.hashpass.tech/api/auth/get-session`) to confirm the deploy that's supposed to have gone out actually did, rather than assuming a push to `main` means production is now correct. Sync `develop` from `main` (`git merge main` on develop) so both branches carry the release commit.
6. **Only now, release to mobile** — dispatch `mobile-android-release.yml` against the tag created in step 4.

## The Golden Rule: Never Manually Edit Version Numbers

All version fields (`package.json`, `app.json`, `apps/mobile-app/config/version.ts`, Android `versionCode`, etc.) must stay in sync. The release scripts handle this automatically. Manual edits cause version skipping and ordering bugs.

## Protected Release Promotion

The repository now treats `develop` as the only release source branch. Promotion to `main` is PR-only.

### What changed

- `npm run release:promote` opens a GitHub PR from `develop` to `main` for the actual **code** changes
- Release PRs currently require `@edcalderon` codeowner approval
- Release PRs must pass the coverage gate and GitHub security scans before merge
- **Code changes must go through that PR — but `npm run release:patch` run directly on `main` (Step 4 below) does push straight to `main`, and that push is *not* blocked.** Confirmed 2026-07-08: `release:patch`'s version-bump/changelog/tag commit pushed to `origin main` and `upstream main` with no rejection. Branch protection here gates the PR-review/coverage/security requirements for the promotion PR's code diff — it does not block every push to `main` outright. Don't assume `release:patch` on `main` needs its own PR; it doesn't, and there is currently no automated job that creates the tag any other way (no CI runs on merge-to-main to do this for you).
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

Both paths are automatic and typically take a few minutes. No manual action is needed for web-only changes after the merge.

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

- Commits the release-prep changes on `develop`
- Pushes the release branch to `origin` and `upstream`
- Opens the protected `develop -> main` PR
- Leaves the stable version bump and release tag for the `main` release step

`npm run release:patch -- --promote` is the same promotion prep path if you prefer to call the release script directly.

**If there's nothing version-relevant to bump**, the script logs `No promotion file changes to commit; using the current HEAD for the promotion PR` and opens the PR against whatever is already on `develop` — this is normal, not an error, when the develop commits since the last release are all feature/doc work with no version-file changes of their own. The PR title still shows the next predicted version; the actual `package.json`/`CHANGELOG.md` bump only happens in Step 4.

If the PR-creation step itself fails on something transient (seen 2026-07-08: `gh pr create` returning `HTTP 502: 502 Bad Gateway`), re-run `npm run release:promote` again rather than hand-issuing the `gh pr create` command it logged — check `git log`/`git status` first to confirm the commit+push already succeeded so you don't duplicate them, but let the script redo the PR-creation call itself.

The PR body should make the actual release contents obvious:

- Auto-generated release summary pulled from the version metadata / changelog first
- Auto-generated implementation bullets for docs, release tooling, and sync changes
- Changed files folded into a collapsible details block for support/debugging
- Release version, base version, release commit, and source branch
- Protected `develop -> main` path reminder

### Step 3 — Merge the release PR

Merge the PR after the branch protection checks pass. Once merged, sync `develop` from `main` so both branches land on the release commit.

### Step 4 — Cut the stable release on `main`

```bash
npm run release:patch
```

Run this on `main` after the PR merges. This is the stable version bump, changelog entry, git tag, and release commit that the Android workflow and web deployment use.

**This is the one step that pushes directly to `main`** — see the note in "What changed" above. There's no PR for this specific commit; that's expected.

If you keep `main` checked out in a separate git worktree (common local setup here — `hashpass.tech-main` alongside the primary `hashpass.tech` checkout on `develop`), run the command from that worktree directly. `git checkout main` will fail with `'main' is already used by worktree at ...` if you try to switch to it from the `develop` checkout — that's not an error to work around, it just means you should `cd` into the other worktree (or use `git -C <path> ...` for individual commands) instead of trying to check out `main` in place.

### Step 5 — Trigger the Android CI

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
| Android APK/AAB | Manual CI trigger on release tag | Play Store |

The Lambda environment variables (secrets, Supabase keys, etc.) are **not** updated by a static deploy. Update them with `node packages/tools/scripts/sync-env.js production --tenant core` or the AWS Lambda console before releasing if secrets changed.
