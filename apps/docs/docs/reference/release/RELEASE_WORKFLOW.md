# Release Workflow

## The Golden Rule: Never Manually Edit Version Numbers

All version fields (`package.json`, `app.json`, `apps/mobile-app/config/version.ts`, Android `versionCode`, etc.) must stay in sync. The release scripts handle this automatically. Manual edits cause version skipping and ordering bugs.

## Web Release (hashpass.tech + dev.hashpass.tech)

The web app now deploys through the target-account pipeline and CloudFront front
door. When you push to `main`:

1. GitHub Actions runs the target-account web checks and deploy orchestration.
2. The target pipeline rebuilds and publishes `hashpass.tech` and `dev.hashpass.tech`.

Both paths are automatic and typically take a few minutes. No manual action is
needed for web-only changes.

Legacy Amplify start-job instructions are archived in
`archive/amplify/README.md` for historical reference only.

## Android Release

For the Play Console track ladder and the future production publishing checklist, see [PLAY_CONSOLE_RELEASE_FLOW.md](./PLAY_CONSOLE_RELEASE_FLOW.md).

Temporary release posture: while the app is under active development, keep Android releases on the development profile. Use the internal preview step first, then alpha on the same tag after internal succeeds. Production dispatches are paused until the release freeze is lifted.

Follow this sequence exactly. Order matters.

### Step 1 — Commit your changes

```bash
git add <files>
git commit -m "fix(scope): describe what changed"
git push origin main
```

### Step 2 — Bump the version

```bash
npm run release:patch   # x.y.Z  (bug fixes, most common)
npm run release:minor   # x.Y.0  (new feature)
npm run release:major   # X.0.0  (breaking change)
```

This script:
- Updates all version fields in sync (package.json, app.json, versionCode, version.ts, versions.json, sw.js, CHANGELOG, README)
- Commits the version bump as `chore: release vX.Y.Z`
- Creates a git tag `vX.Y.Z`
- Pushes main + tag to `origin` (hashpass-tech/hashpass.tech)

### Step 3 — Trigger the Android CI

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=development \
  --field track=internal \
  --field auto_promote_alpha=true \
  --field alpha_release_status=draft \
  --field backend=fastlane \
  --field runner=aws-ec2
```

This builds a signed AAB on the EC2 runner and submits it to Play via Fastlane on the development profile.
Use `environment=development` with `track=internal` for the first pass.
Add `auto_promote_alpha=true` to have the workflow dispatch the matching alpha run automatically after the internal release succeeds. Set `alpha_release_status=draft` only when Play still treats the app as draft.
Expo prebuild now enables Android release minification, so Gradle emits a `mapping.txt` file for release builds. The Fastlane lane uploads any Play deobfuscation files it finds in the Android build outputs, such as `mapping.txt` or `native-debug-symbols.zip`, so crash traces stay readable in Play Console. This only applies to builds created after this change; the already-uploaded draft artifact will stay without deobfuscation until a new build is uploaded.

For the first closed-testing release, rerun the same tag with `environment=development`, `track=alpha`, and set the release status to draft while the Play Console app is still a draft:

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=development \
  --field track=alpha \
  --field release_status=draft \
  --field backend=fastlane \
  --field runner=aws-ec2
```

The workflow track input maps directly to Play Console tracks. `internal` is the first pass, `alpha` is the closed-testing path requested for Play review prep, and production is paused until the freeze lifts. `release_status` defaults to `completed`, but the Play API requires `draft` for the first closed-testing upload while the app is still in draft.
When you want one-step promotion, keep the first dispatch on `track=internal` and set `auto_promote_alpha=true`; the workflow will queue the alpha release for the same tag after internal succeeds.
The workflow also matches Expo build credentials by the `ANDROID_UPLOAD_KEY_SHA1` repository variable before exporting the keystore to Fastlane.

### Step 4 — Back up to the personal fork

```bash
git push upstream main v<NEW_VERSION>
```

Where `upstream` = `edcalderon/hashpass.tech`.

## Repository Remotes

| Remote | Repo | Purpose |
|--------|------|---------|
| `origin` | `hashpass-tech/hashpass.tech` | Primary — CI/CD runs from here |
| `upstream` | `edcalderon/hashpass.tech` | Personal backup |

Always push to `origin` first. Push to `upstream` after the release tag is created.

## Versioning Scheme

Versions follow `MAJOR.MINOR.PATCH` (semver) and `versionCode` is derived from the version (e.g., v1.8.76 → versionCode 10876). The release script calculates `versionCode` automatically.

## What Gets Rebuilt on Each Release

| What | When rebuilt | Where |
|------|-------------|-------|
| Web static bundle | Every target web release | `hashpass.tech`, `dev.hashpass.tech` |
| Lambda API routes | Every SST deploy | `api.hashpass.tech` |
| Android APK/AAB | Manual CI trigger on release tag | Play Store |

The Lambda environment variables (secrets, Supabase keys, etc.) are **not** updated by a deploy. They must be updated separately in the AWS Lambda console if changed.
