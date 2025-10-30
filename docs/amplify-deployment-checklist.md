# Amplify Deployment Checklist

## Pre-Deployment Checklist

### ✅ Repository Setup
- [ ] `amplify.yml` exists in repository root
- [ ] `amplify-main.yml` exists (for main branch)
- [ ] `amplify-bsl2025.yml` exists (for bsl2025 branch)
- [ ] All files are committed and pushed

### ✅ Amplify Console Configuration

**For Main Branch:**
- [ ] App connected to correct repository (`edcalderon/hashpass.tech` or `lstech-solutions/bsl2025.hashpass.tech`)
- [ ] Branch: `main`
- [ ] Build specification: `amplify.yml` (NOT `buildspec.yml`)
- [ ] Build settings content matches `amplify-main.yml`
- [ ] Environment variables set:
  - `AMPLIFY_EVENT_ID=default`
  - `AMPLIFY_SHOW_ALL_EVENTS=true`
  - `AMPLIFY_EVENT_DOMAIN=hashpass.tech`

**For bsl2025 Branch:**
- [ ] Branch: `bsl2025`
- [ ] Build specification: `amplify.yml` (NOT `buildspec.yml`)
- [ ] Build settings content matches `amplify-bsl2025.yml`
- [ ] Environment variables set:
  - `AMPLIFY_EVENT_ID=bsl2025`
  - `AMPLIFY_SHOW_ALL_EVENTS=false`
  - `AMPLIFY_EVENT_DOMAIN=bsl2025.hashpass.tech`

### ✅ Domain Configuration
- [ ] Main branch domain: `hashpass.tech`
- [ ] bsl2025 branch domain: `bsl2025.hashpass.tech`
- [ ] SSL certificates provisioned

## Common Issues & Fixes

### Issue: "Missing frontend definition in buildspec"
**Fix:** Change build specification from `buildspec.yml` to `amplify.yml` in Amplify Console

### Issue: Wrong config being used
**Fix:** Copy correct config (`amplify-main.yml` or `amplify-bsl2025.yml`) into Amplify Console build settings

### Issue: All events showing in single-event branch
**Fix:** Verify `AMPLIFY_SHOW_ALL_EVENTS=false` is set in environment variables

### Issue: Routes returning 404
**Fix:** Check redirects in amplify.yml match available routes for that branch

## Quick Reference

| Branch | Domain | Config File | Show All Events |
|--------|--------|-------------|-----------------|
| main | hashpass.tech | amplify-main.yml | true |
| bsl2025 | bsl2025.hashpass.tech | amplify-bsl2025.yml | false |

