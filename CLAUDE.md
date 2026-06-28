# Claude Code Instructions for HashPass.tech

## Critical Rules

### Version Management
**NEVER manually edit version numbers in package.json or app.json.**

Always use the release script:
```bash
npm run release:patch   # Bumps x.y.Z (patch)
npm run release:minor   # Bumps x.Y.0 (minor)
npm run release:major   # Bumps X.0.0 (major)
```

The script:
- Automatically updates ALL version fields (package.json, app.json, READMEs, etc.)
- Creates git commit with proper message
- Creates version tag
- Pushes to origin/main with tag
- Ensures versions stay in sync across the monorepo

**Why:** Manual version bumps cause version skipping, inconsistency, and incorrect release ordering.

### Mobile Android Release Workflow
**Temporary release posture:** while the app is under active development, keep Android publishing internal-first. Do not dispatch the production track for now. Publish `environment=development` first, then retry alpha only after the same tag has a successful internal release. The workflow already blocks alpha until internal succeeds for that tag.

1. **Create commit** with your changes
2. **Push to origin/main** (hashpass-tech/hashpass.tech)
3. **Run `npm run release:patch`** — this:
   - Bumps version
   - Creates tag
   - Pushes to origin/main
4. **Trigger CI workflow** manually:
   ```bash
   gh workflow run mobile-android-release.yml \
     --repo hashpass-tech/hashpass.tech \
     --ref v<NEW_VERSION> \
     --field environment=production \
     --field track=production \
     --field backend=fastlane \
     --field runner=aws-ec2
   ```
   Use `environment=development` only when you explicitly want the internal preview track. For closed testing, publish the matching internal release first on the same tag, then run `environment=production` with `track=alpha`. The workflow now blocks alpha until a successful internal release exists for that tag, which keeps version codes in order and prevents internal/closed drift.
   For the first Play Console closed-testing release, keep `environment=production`, set `track=alpha`, and use `release_status=draft` while the Play Console app is still in draft.
   Production track publishing (`environment=production` / `track=production`) remains paused until the release freeze is lifted.
   The release workflow uses the `ANDROID_UPLOAD_KEY_SHA1` repository variable to select the Expo build credential that matches the Play upload certificate.
   Expo prebuild enables Android release minification, so Gradle emits a `mapping.txt` file for release builds.
   The Fastlane lane also uploads any deobfuscation files it finds in the Android build outputs, so Play Console crash traces stay readable when `mapping.txt` or `native-debug-symbols.zip` is present. This only applies to builds created after this change; the already-uploaded draft artifact will stay without deobfuscation until a new build is uploaded.
   For the full internal, closed, open, and production track ladder plus the publishing checklist, see `apps/docs/docs/reference/release/PLAY_CONSOLE_RELEASE_FLOW.md`.
5. **Push to edcalderon fork** after version bump (for backup):
   ```bash
   git push upstream main <TAG_NAME>
   ```

**Android CI memory tuning:** See `apps/docs/docs/infra/ANDROID_CI_MEMORY.md` before touching `NODE_OPTIONS` or `GRADLE_MB` in the workflow — wrong values cause silent SIGTERM or Metro OOM.

### Native Android App Environment — dev builds hit api-dev (intentional)

**This is by design, not a bug.**

Android builds triggered with `--field environment=development` bake `EXPO_PUBLIC_SUPABASE_PROFILE=core-development` into the JS bundle. At runtime, `readBuildEnvironment()` in `lib/api-client.ts` detects the substring `"development"` in that value and routes ALL API calls to `https://api-dev.hashpass.tech/api` (the `hashpass-api-dev` Lambda in us-east-1).

| Build field | Supabase profile | API Lambda |
|-------------|-----------------|------------|
| `environment=development` | `core-development` | `hashpass-api-dev` (us-east-1) |
| `environment=production` | `core-production` | `hashpass-api-prod` (us-east-1) |

**Consequence:** If `hashpass-api-dev` is out of date, dev builds will behave differently from prod — even if prod was just fixed. Always keep `develop` branch in sync with `main` so that Amplify builds of `develop` update `hashpass-api-dev` to the same code.

```bash
# Sync develop with main after every release
git checkout develop && git merge main && git push origin develop && git push upstream develop
git checkout main
```

**If api-dev urgently needs the same code as api-prod** (e.g. a hotfix was released to main but develop wasn't synced), you can manually copy the prod Lambda bundle to dev:
```bash
# Download prod bundle and deploy to dev
aws lambda get-function --function-name hashpass-api-prod --region us-east-1 \
  --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda-prod.zip
aws lambda update-function-code --function-name hashpass-api-dev \
  --region us-east-1 --zip-file fileb:///tmp/lambda-prod.zip
```

### Android Launch Crash Debugging
If the app won't open on Android:

1. **Check Play Console Android Vitals** for crash stack trace (most reliable source)
2. **Verify Expo package versions** match bundledNativeModules:
   ```bash
   node -e "
   const bundled = require('./node_modules/expo/bundledNativeModules.json');
   for (const [pkg, range] of Object.entries(bundled)) {
     const actual = require(\`./node_modules/\${pkg}/package.json\`).version;
     console.log(pkg + ': installed=' + actual + ' expected=' + range);
   }
   "
   ```
3. **Never assume a fix worked** without testing on Play Store internal or the relevant closed-testing track first.

### JavaScript Errors on Startup
If app opens but crashes with a JS error:

- Check `framer-motion` version — v12+ has React 19 compatibility issues on mobile
- Downgrade to v11.11.17 if seeing `addDomEvent` or animation-related errors
- Never assume "works on web" = "works on mobile" — platform differences matter

## Security Requirements
**These are non-negotiable per v1.8.6+:**

- `::add-mask::` workflow commands for all secrets in CI
- No secrets visible in GitHub Actions logs
- `print_command: false` in Fastlane gradle() calls
- Keystore files gitignored (`config/android-signing.env`, `config/hashpass-release.keystore`)
- Environment variables properly masked in CI

## Push Destinations
- **origin** = `hashpass-tech/hashpass.tech` (public org repo — PRIMARY)
- **upstream** = `edcalderon/hashpass.tech` (personal fork — backup)

Always push to origin for CI/CD. Push to upstream for backup after release scripts.

## Deployment Architecture

### How Each Domain Is Deployed

On every push to `main`, **two independent auto-deploy systems** run in parallel:

| Domain | System | What triggers it |
|--------|--------|-----------------|
| `hashpass.tech` | AWS Amplify (`amplify.yml`) | Push to `main` (Amplify webhook) |
| `api.hashpass.tech` | AWS Lambda `hashpass-api-prod` (us-east-1) | **Same Amplify build** — postBuild step runs `package-lambda.sh` then `aws lambda update-function-code` |
| `bsl.hashpass.tech` | SST StaticSite via SST Console autodeploy | Push to `main` (SST Console webhook, configured in `sst.config.ts`) |
| Android | EC2 + Fastlane → Play Store | Manual `gh workflow run` (see workflow below) |

**Critical facts:**
- `api.hashpass.tech` Lambda is in **us-east-1**, deployed by **Amplify** (NOT SST, NOT GitHub Actions)
- `bsl.hashpass.tech` is deployed by **SST Console** (NOT the `infra-deploy.yml` GitHub Actions workflow)
- `infra-deploy.yml` auto-triggers on push to `main`/`develop` when infra or API paths change (Route53 + CloudFront permissions added to IAM role in v1.8.92)

### Checking Deployment Status

```bash
# Check Amplify build history (hashpass.tech + Lambda)
aws amplify list-jobs --app-id dy8duury54wam --region us-east-2 \
  --branch-name main \
  --query 'jobSummaries[0:5].{id:jobId,status:status,commit:commitId}' --output table

# Trigger manual Amplify build (if auto didn't fire)
aws amplify start-job --app-id dy8duury54wam --region us-east-2 \
  --branch-name main --job-type RELEASE
```

For `bsl.hashpass.tech`: check SST Console at sst.dev.

### Key Files
- `.github/workflows/mobile-android-release.yml` — Android release CI
- `.github/workflows/infra-deploy.yml` — SST deploy (manual-only)
- `amplify.yml` — Amplify build config (also deploys Lambda in postBuild)
- `packages/infra/sst.config.ts` — SST config with autodeploy settings
- `packages/infra/lambda/index.js` — Lambda handler for API routes
- `apps/mobile-app/package.json` — mobile version source of truth
- `apps/mobile-app/app.json` — Expo config
- `packages/tools/scripts/release.js` — version script
- `packages/tools/scripts/package-lambda.sh` — Lambda packaging script

## Headroom MCP (Token Compression)

Headroom compresses long conversation context to save tokens. It's installed as a Claude Code MCP server.

### Automatic usage (REQUIRED)

**Always invoke `mcp__headroom__headroom_compress` proactively — do not wait to be asked:**

- At the start of any long session (after reading multiple large files or accumulating significant context)
- Whenever the conversation has gone through several back-and-forth turns on a complex task
- Before starting a new major subtask within the same session
- Any time you notice the system-reminder mentions context is being compressed/summarized

After compressing, call `mcp__headroom__headroom_stats` once to confirm compression succeeded and log the token savings. Use `mcp__headroom__headroom_retrieve` if you need to recall something from earlier in the conversation that may have been compressed.

### Installation (already done — for reference / re-setup)
```bash
# 1. Install into a permanent venv
python3 -m venv ~/.headroom/venv
~/.headroom/venv/bin/pip install "headroom-ai[mcp]"

# 2. Register with Claude Code
~/.headroom/venv/bin/headroom mcp install
# → writes to ~/.claude.json mcpServers.headroom

# 3. Fix command path to absolute (the installer writes "headroom" which won't be on PATH)
python3 - <<'EOF'
import json
with open('/home/ed/.claude.json', 'r') as f:
    data = json.load(f)
data['mcpServers']['headroom']['command'] = '/home/ed/.headroom/venv/bin/headroom'
with open('/home/ed/.claude.json', 'w') as f:
    json.dump(data, f, indent=2)
EOF

# 4. Restart Claude Code
```

### MCP tools available after restart
- `headroom_compress` — compress current context
- `headroom_retrieve` — retrieve compressed segments
- `headroom_stats` — show compression stats

### Roll back / remove headroom
```bash
# Remove MCP registration from Claude Code config
python3 - <<'EOF'
import json
with open('/home/ed/.claude.json', 'r') as f:
    data = json.load(f)
data.get('mcpServers', {}).pop('headroom', None)
with open('/home/ed/.claude.json', 'w') as f:
    json.dump(data, f, indent=2)
print("Removed headroom from mcpServers")
EOF

# Delete the venv (optional)
rm -rf ~/.headroom/venv

# Restart Claude Code
```

## OTP Authentication (Native Mobile)

The native app uses a 6-digit code flow, NOT magic links. Flow:

1. **Send** (`/api/auth/otp`): `admin.generateLink({ type: 'magiclink' })` → stores `{type}::{hashed_token}::{email_otp}` in `otp_codes` table → sends 6-digit code by email/SMS
2. **Verify** (`/api/auth/otp/verify`): DB lookup by code → direct `fetch()` to GoTrue `/auth/v1/verify` (bypasses Supabase JS client to avoid PKCE fields) → tries `{ token_hash, type }` first, then `{ email, token: email_otp, type }` → returns session to client → client calls `supabase.auth.setSession()`

**Why direct fetch:** `supabase.auth.verifyOtp()` injects PKCE fields that cause GoTrue to reject with "Only the token_hash and type should be provided".

See `apps/docs/docs/auth/AUTH_FLOW.md` for full details.

## DB Schema Conventions

### Table Naming
- **Singular nouns** — `user`, `pass`, `meeting` (not `users`, `passes`, `meetings`)
- **Exception:** `ba_users` keeps the `ba_` prefix to distinguish Better Auth's internal store from the canonical registry
- **`user_*` prefix tables** (`user_profile`, `user_balance`, etc.) use the prefix as a namespace — the entity after the underscore is the singular noun

### Canonical User Registry (`public.user`)
Provider-agnostic source of truth. All auth providers replicate here.

| Table | Purpose |
|-------|---------|
| `public.user` | Canonical registry — one row per unique email across ALL auth providers |
| `ba_users` | Better Auth's internal user store (BSL event platform only); configured via `user: { modelName: 'ba_users' }` in `lib/server/better-auth.ts` |
| `user_profiles` | Extended profile data; `user_id uuid → auth.users(id)` FK |
| `user_balances` | Token balances; `user_id uuid → auth.users(id)` FK |
| `user_roles` | Role assignments; `user_id uuid → auth.users(id)` FK |
| `user_transactions` | Token transaction log; `user_id uuid → auth.users(id)` FK |
| `user_blocks` | Blocked user pairs; `blocker_id/blocked_id uuid → auth.users(id)` FK |

Migration history: V004 (create), V005 (rename ba_users), V006 (singular rename + FKs).
See `apps/docs/docs/auth/USER_REGISTRY.md` for full schema and sync paths.

## Recent Fixes
- v1.8.114: V006 migration — renamed canonical `public.users` → `public.user` (SQL singular standard); added FK constraints from all `user_*` tables → `auth.users(id)` ON DELETE CASCADE; fixed `user_profiles.user_id` text→uuid; applied to both prod and dev
- v1.8.113: V004+V005 migrations applied — created `public.user` canonical registry with `upsert_public_user_registry()` + auth.users sync triggers; renamed Better Auth `user` → `ba_users`; configured `modelName: 'ba_users'` in Better Auth
- v1.8.112: Delete Account fix — resolve Supabase auth UUID by email (Directus OAuth path sends Directus UUID, not Supabase UUID)
- v1.8.92: OTP verify: fixed body order (token_hash first) and break logic (only stop on expired); re-enabled infra-deploy push trigger after adding Route53+CloudFront+ACM to IAM role `hashpass-infra-deploy-sst`
- v1.8.91: infra-deploy.yml converted to manual-only (temp fix; reverted in v1.8.92)
- v1.8.90: Fixed gitleaks false positive (gitleaks README.md extracted into workspace by tar; now extracts binary only)
- v1.8.89: OTP: store email_otp alongside token_hash; verify tries both GoTrue paths
- v1.8.85: OTP digit inputs wrapped in View to fix web layout overflow (6 inputs were overflowing container)
- v1.8.84: Bypassed Supabase JS client for OTP verify (GoTrue rejected extra PKCE fields); added individual digit editing, Clear button, auto-submit on 6th digit
- v1.8.9: Fixed 5 Expo SDK 53 package mismatches (expo-image, expo-clipboard, expo-image-picker, expo-router, expo-web-browser) + downgraded framer-motion 12→11
- v1.8.4+: All versions before v1.8.8 crashed on Android startup with `java.lang.NoSuchMethodError` in ExpoImageModule
