# Release Workflow

## The Golden Rule: Never Manually Edit Version Numbers

All version fields (`package.json`, `app.json`, `apps/mobile-app/config/version.ts`, Android `versionCode`, etc.) must stay in sync. The release scripts handle this automatically. Manual edits cause version skipping and ordering bugs.

## Web Release (hashpass.tech + bsl.hashpass.tech)

The web app deploys automatically. When you push to `main`:

1. GitHub Actions (`infra-deploy.yml`) runs the SST deploy → updates `bsl.hashpass.tech` and `api.hashpass.tech`
2. AWS Amplify detects the push → rebuilds and deploys `hashpass.tech`

Both happen in parallel and take 5–15 minutes. No manual action needed for web-only changes.

If Amplify auto-deploy is not triggering, start it manually:
```bash
# Get the app ID from Amplify console (us-east-2), then:
aws amplify start-job --app-id <ID> --region us-east-2 --branch-name main --job-type RELEASE
```

## Android Release

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
  --field environment=production \
  --field track=production \
  --field backend=fastlane \
  --field runner=aws-ec2
```

This builds a signed AAB on the EC2 runner and submits it to the Play Store production track via Fastlane.
Use `environment=development` only when you explicitly want the preview/internal track.

For the first closed-testing release, keep `environment=production` and switch the track to alpha:

```bash
gh workflow run mobile-android-release.yml \
  --repo hashpass-tech/hashpass.tech \
  --ref v<NEW_VERSION> \
  --field environment=production \
  --field track=alpha \
  --field backend=fastlane \
  --field runner=aws-ec2
```

The workflow track input maps directly to Play Console tracks. `production` remains the default; `alpha` is the closed-testing path requested for Play review prep.

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
| Web static bundle | Every push to `main` (Amplify + SST) | `hashpass.tech`, `bsl.hashpass.tech` |
| Lambda API routes | Every SST deploy | `api.hashpass.tech` |
| Android APK/AAB | Manual CI trigger on release tag | Play Store |

The Lambda environment variables (secrets, Supabase keys, etc.) are **not** updated by a deploy. They must be updated separately in the AWS Lambda console if changed.
