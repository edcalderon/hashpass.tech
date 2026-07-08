# Release Workflow

## The Golden Rule: Never Manually Edit Version Numbers

All version fields (`package.json`, `app.json`, `apps/mobile-app/config/version.ts`, Android `versionCode`, etc.) must stay in sync. The release scripts handle this automatically. Manual edits cause version skipping and ordering bugs.

## Protected Release Promotion

The repository now treats `develop` as the only release source branch. Promotion to `main` is PR-only.

### What changed

- `npm run release:patch` still creates the version bump, changelog entry, tag, and release commit on `develop`
- `npm run release:promote` now opens a GitHub PR from `develop` to `main`
- Direct pushes to `main` are blocked by branch protection
- Release PRs currently require `@edcalderon` codeowner approval
- Release PRs must pass the coverage gate and GitHub security scans before merge

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

The PR body should make the actual release contents obvious:

- Files changed since the previous release
- Release version, base version, release commit, and source branch
- Protected `develop -> main` path reminder

### Step 3 — Merge the release PR

Merge the PR after the branch protection checks pass. Once merged, sync `develop` from `main` so both branches land on the release commit.

### Step 4 — Cut the stable release on `main`

```bash
npm run release:patch
```

Run this on `main` after the PR merges. This is the stable version bump, changelog entry, git tag, and release commit that the Android workflow and web deployment use.

### Step 5 — Trigger the Android CI

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=development \
  --field track=internal \
  --field auto_promote_alpha=true \
  --field backend=fastlane \
  --field runner=aws-ec2
```

This builds a signed AAB on the EC2 runner and submits it to Play via Fastlane on the development profile.

Use `environment=development` with `track=internal` for the first pass.

Add `auto_promote_alpha=true` to have the workflow dispatch the matching alpha run automatically after the internal release succeeds. Leave `alpha_release_status` at its default `completed` unless Play still treats the app as draft for the first closed-testing release.

Expo prebuild enables Android release minification, so Gradle emits a `mapping.txt` file for release builds. The Fastlane lane uploads any Play deobfuscation files it finds in the Android build outputs, such as `mapping.txt` or `native-debug-symbols.zip`, so crash traces stay readable in Play Console. This only applies to builds created after this change; the already-uploaded draft artifact will stay without deobfuscation until a new build is uploaded.

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

The workflow track input maps directly to Play Console tracks. `internal` is the first pass, `alpha` is the closed-testing path requested for Play review prep, and production is paused until the freeze lifts. `release_status` defaults to `completed`, and that is the direct-publish path for closed testing once the app is no longer in draft.

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
