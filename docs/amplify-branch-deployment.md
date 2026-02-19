# Amplify Branch-Based Deployment Guide

This guide explains how to manage branch-based deployments in AWS Amplify for different event domains.

## Architecture Overview

- **Main Branch** → `hashpass.tech` (shows all events in explorer)
- **bsl2025 Branch** → `bsl2025.hashpass.tech` (shows only BSL2025 event)

## File Structure

```
├── amplify.yml              # Default/fallback config (for compatibility)
├── amplify-main.yml          # Main branch configuration
├── amplify-bsl2025.yml      # BSL2025 branch configuration
└── scripts/
    └── setup-amplify.sh     # Script to link correct config per branch
```

## Setup Instructions

### Option 1: Amplify Console Configuration (Recommended)

1. **In AWS Amplify Console:**

   For **Main Branch:**
   - Go to your Amplify App → Main branch → Build settings
   - Edit `amplify.yml` → Replace content with `amplify-main.yml` content
   - Save

   For **bsl2025 Branch:**
   - Go to your Amplify App → bsl2025 branch → Build settings
   - Edit `amplify.yml` → Replace content with `amplify-bsl2025.yml` content
   - Save

2. **Set Environment Variables per Branch:**

   **Main Branch:**
   ```
   AMPLIFY_EVENT_ID=default
   AMPLIFY_SHOW_ALL_EVENTS=true
   AMPLIFY_EVENT_DOMAIN=hashpass.tech
   ```

   **bsl2025 Branch:**
   ```
   AMPLIFY_EVENT_ID=bsl2025
   AMPLIFY_SHOW_ALL_EVENTS=false
   AMPLIFY_EVENT_DOMAIN=bsl2025.hashpass.tech
   ```

### Option 2: Git-Based Configuration (Automated)

Create a script that automatically links the correct config:

```bash
# scripts/setup-amplify.sh
#!/bin/bash

BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)

if [ "$BRANCH_NAME" = "main" ]; then
  cp amplify-main.yml amplify.yml
  echo "✅ Using amplify-main.yml for main branch"
elif [ "$BRANCH_NAME" = "bsl2025" ]; then
  cp amplify-bsl2025.yml amplify.yml
  echo "✅ Using amplify-bsl2025.yml for bsl2025 branch"
else
  echo "⚠️  Unknown branch, using default amplify.yml"
fi
```

Add to `.gitignore`:
```
amplify.yml
```

**Note:** This approach requires manual setup in Amplify Console for the first time.

### Option 3: Single amplify.yml with Conditional Logic (Current Approach)

Modify `amplify.yml` to detect branch and apply appropriate config:

```yaml
version: 1.0
frontend:
  phases:
    preBuild:
      commands:
        # Detect branch and set environment variables
        - |
          if [ "$AWS_BRANCH" = "main" ]; then
            export AMPLIFY_EVENT_ID=default
            export AMPLIFY_SHOW_ALL_EVENTS=true
          elif [ "$AWS_BRANCH" = "bsl2025" ]; then
            export AMPLIFY_EVENT_ID=bsl2025
            export AMPLIFY_SHOW_ALL_EVENTS=false
          fi
        # ... rest of preBuild commands
```

## Code-Level Event Detection

Update `lib/event-detector.ts` to respect environment variables:

```typescript
// Check if we're in a single-event deployment
const isSingleEventDeployment = process.env.AMPLIFY_SHOW_ALL_EVENTS !== 'true';
const eventId = process.env.AMPLIFY_EVENT_ID || 'bsl2025';

export const AVAILABLE_EVENTS: EventInfo[] = [
  {
    id: 'bsl2025',
    // ... config
    available: isSingleEventDeployment ? eventId === 'bsl2025' : true,
  },
  // Other events only available in main branch
];
```

## Domain Configuration

### Main Branch (hashpass.tech)
- **Domain:** `hashpass.tech`
- **Shows:** All events in explorer
- **Root route:** `/` → Explorer page
- **Event routes:** `/events/*` → Available for all events

### bsl2025 Branch (bsl2025.hashpass.tech)
- **Domain:** `bsl2025.hashpass.tech`
- **Shows:** Only BSL2025 event
- **Root route:** `/` → Redirects to `/events/bsl2025/home`
- **Event routes:** Only `/events/bsl2025/*` routes available

## Adding New Event Branches

1. **Create new branch:**
   ```bash
   git checkout -b event2026
   ```

2. **Create amplify-event2026.yml:**
   - Copy `amplify-bsl2025.yml`
   - Update event-specific paths and domains
   - Update environment variables

3. **Configure in Amplify Console:**
   - Add new branch
   - Set build settings to use `amplify-event2026.yml`
   - Configure domain: `event2026.hashpass.tech`

4. **Update code:**
   - Add event configuration to `config/events.ts`
   - Update `lib/event-detector.ts` if needed

## Best Practices

1. **Keep amplify.yml as fallback** - Don't delete it, use it as default
2. **Use environment variables** - Avoid hardcoding branch names in code
3. **Test locally** - Set `AMPLIFY_SHOW_ALL_EVENTS` and `AMPLIFY_EVENT_ID` locally
4. **Document changes** - Update this guide when adding new events
5. **Git strategy** - Keep branch-specific configs in git, link them per branch

## Troubleshooting

### Issue: Wrong amplify.yml being used
- **Solution:** Check Amplify Console → Build settings → Make sure correct config is set per branch

### Issue: All events showing in single-event branch
- **Solution:** Check environment variables `AMPLIFY_SHOW_ALL_EVENTS` is set to `false`

### Issue: 404 errors on routes
- **Solution:** Check redirects in amplify.yml match the branch's available routes

## Maintenance

- **No conflicts:** Branch-specific configs don't conflict because:
  - Each branch uses its own amplify.yml (managed in Amplify Console)
  - Or uses environment variables (no file conflicts)
- **Easy updates:** Update base configs (`amplify-main.yml`, `amplify-bsl2025.yml`) and sync to Amplify Console
- **Scalability:** Add new events by creating new branches and configs

