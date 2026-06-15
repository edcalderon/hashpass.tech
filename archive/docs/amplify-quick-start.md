# Quick Start: Amplify Branch Configuration

## Current Setup Recommendation: **Option 1 (Amplify Console)**

This is the most maintainable approach with no git conflicts.

### Step 1: Configure Main Branch

1. Go to AWS Amplify Console → Your App → **main** branch
2. Click **Build settings** → **Edit**
3. Copy content from `amplify-main.yml` → Paste into Amplify Console's `amplify.yml`
4. Save

### Step 2: Configure bsl2025 Branch

1. Go to AWS Amplify Console → Your App → **bsl2025** branch  
2. Click **Build settings** → **Edit**
3. Copy content from `amplify-bsl2025.yml` → Paste into Amplify Console's `amplify.yml`
4. Save

### Step 3: Set Environment Variables

**Main Branch:**
- Go to **main** branch → **Environment variables**
- Add:
  ```
  AMPLIFY_EVENT_ID=default
  AMPLIFY_SHOW_ALL_EVENTS=true
  AMPLIFY_EVENT_DOMAIN=hashpass.tech
  ```

**bsl2025 Branch:**
- Go to **bsl2025** branch → **Environment variables**
- Add:
  ```
  AMPLIFY_EVENT_ID=bsl2025
  AMPLIFY_SHOW_ALL_EVENTS=false
  AMPLIFY_EVENT_DOMAIN=bsl2025.hashpass.tech
  ```

### Step 4: Configure Domains

**Main Branch:**
- Add custom domain: `hashpass.tech`
- SSL certificate will be auto-provisioned

**bsl2025 Branch:**
- Add custom domain: `bsl2025.hashpass.tech`
- SSL certificate will be auto-provisioned

## Alternative: Automated Script (Option 2)

If you prefer git-based approach:

```bash
# Run before committing/pushing
./scripts/setup-amplify.sh

# Commit the linked amplify.yml
git add amplify.yml
git commit -m "Update amplify config for branch"
```

**Note:** Add `amplify.yml` to `.gitignore` if using this approach to avoid conflicts.

## Key Differences

| Feature | Main Branch | bsl2025 Branch |
|---------|-------------|----------------|
| Domain | hashpass.tech | bsl2025.hashpass.tech |
| Shows | All events | BSL2025 only |
| Root route | `/` → Explorer | `/` → `/events/bsl2025/home` |
| Available routes | `/events/*` | `/events/bsl2025/*` only |

## Testing Locally

Set environment variables to test branch behavior:

```bash
# Test main branch (all events)
AMPLIFY_SHOW_ALL_EVENTS=true npm run dev

# Test bsl2025 branch (single event)
AMPLIFY_SHOW_ALL_EVENTS=false AMPLIFY_EVENT_ID=bsl2025 npm run dev
```

## Troubleshooting

**Q: Wrong config being used?**  
A: Check Amplify Console → Build settings per branch

**Q: All events showing in single-event branch?**  
A: Verify `AMPLIFY_SHOW_ALL_EVENTS=false` in environment variables

**Q: Routes returning 404?**  
A: Check redirects in amplify.yml match available routes

