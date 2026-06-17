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
     --field environment=development \
     --field backend=fastlane \
     --field runner=aws-ec2
   ```
5. **Push to edcalderon fork** after version bump (for backup):
   ```bash
   git push upstream main <TAG_NAME>
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
3. **Never assume a fix worked** without testing on Play Store internal track first

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

## Key Files
- `.github/workflows/mobile-android-release.yml` — Android release CI
- `apps/mobile-app/package.json` — mobile version source of truth
- `apps/mobile-app/app.json` — Expo config
- `packages/tools/scripts/release.js` — version script

## Recent Fixes
- v1.8.9: Fixed 5 Expo SDK 53 package mismatches (expo-image, expo-clipboard, expo-image-picker, expo-router, expo-web-browser) + downgraded framer-motion 12→11
- v1.8.4+: All versions before v1.8.8 crashed on Android startup with `java.lang.NoSuchMethodError` in ExpoImageModule
