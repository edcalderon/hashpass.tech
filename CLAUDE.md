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

## Headroom MCP (Token Compression)

Headroom compresses long conversation context to save tokens. It's installed as a Claude Code MCP server.

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

## Recent Fixes
- v1.8.85: OTP digit inputs wrapped in View to fix web layout overflow (6 inputs were overflowing container)
- v1.8.84: Bypassed Supabase JS client for OTP verify (GoTrue rejected extra PKCE fields); added individual digit editing, Clear button, auto-submit on 6th digit
- v1.8.9: Fixed 5 Expo SDK 53 package mismatches (expo-image, expo-clipboard, expo-image-picker, expo-router, expo-web-browser) + downgraded framer-motion 12→11
- v1.8.4+: All versions before v1.8.8 crashed on Android startup with `java.lang.NoSuchMethodError` in ExpoImageModule
