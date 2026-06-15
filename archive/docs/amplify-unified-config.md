# Unified amplify.yml for Branch-Based Deployment

## Overview

This approach uses a **single `amplify.yml` file** that automatically adapts to different branches using the `AWS_BRANCH` environment variable that Amplify automatically provides.

## How It Works

The unified `amplify.yml` detects the branch using `$AWS_BRANCH` and sets appropriate environment variables:

```yaml
- |
  if [ "$AWS_BRANCH" = "main" ]; then
    export AMPLIFY_SHOW_ALL_EVENTS=${AMPLIFY_SHOW_ALL_EVENTS:-true}
    export AMPLIFY_EVENT_ID=${AMPLIFY_EVENT_ID:-default}
  elif [ "$AWS_BRANCH" = "bsl2025" ]; then
    export AMPLIFY_SHOW_ALL_EVENTS=${AMPLIFY_SHOW_ALL_EVENTS:-false}
    export AMPLIFY_EVENT_ID=${AMPLIFY_EVENT_ID:-bsl2025}
  fi
```

The `${VAR:-default}` syntax means: use `VAR` if set, otherwise use `default`.

## Benefits

✅ **Single file in git** - No conflicts, easy to maintain  
✅ **Automatic branch detection** - Uses `AWS_BRANCH` automatically set by Amplify  
✅ **Override capability** - Can override via Amplify Console environment variables  
✅ **Works for all branches** - Main, bsl2025, and any future branches  
✅ **No console configuration needed** - Just set environment variables per branch  

## Setup Instructions

### Step 1: Use Unified amplify.yml

The `amplify.yml` file in the repository now works for all branches. Just commit and push.

### Step 2: Set Environment Variables per Branch (Optional but Recommended)

**Main Branch:**
- Go to Amplify Console → **main** branch → **Environment variables**
- Set (optional, defaults are already correct):
  ```
  AMPLIFY_SHOW_ALL_EVENTS=true
  AMPLIFY_EVENT_ID=default
  AMPLIFY_EVENT_DOMAIN=hashpass.tech
  ```

**bsl2025 Branch:**
- Go to Amplify Console → **bsl2025** branch → **Environment variables**
- Set (optional, defaults are already correct):
  ```
  AMPLIFY_SHOW_ALL_EVENTS=false
  AMPLIFY_EVENT_ID=bsl2025
  AMPLIFY_EVENT_DOMAIN=bsl2025.hashpass.tech
  ```

**Note:** If you don't set these, the defaults based on `AWS_BRANCH` will be used automatically.

## Behavior by Branch

| Branch | Default Behavior | Override Available |
|--------|------------------|-------------------|
| `main` | Shows all events (`AMPLIFY_SHOW_ALL_EVENTS=true`) | Yes, via env vars |
| `bsl2025` | Shows only BSL2025 (`AMPLIFY_SHOW_ALL_EVENTS=false`) | Yes, via env vars |
| Other | Defaults to bsl2025 behavior | Yes, via env vars |

## Adding New Branches

To add a new event branch (e.g., `event2026`):

1. **Add to amplify.yml preBuild section:**
   ```yaml
   elif [ "$AWS_BRANCH" = "event2026" ]; then
     export AMPLIFY_SHOW_ALL_EVENTS=${AMPLIFY_SHOW_ALL_EVENTS:-false}
     export AMPLIFY_EVENT_ID=${AMPLIFY_EVENT_ID:-event2026}
     export AMPLIFY_EVENT_DOMAIN=${AMPLIFY_EVENT_DOMAIN:-event2026.hashpass.tech}
   ```

2. **Set environment variables in Amplify Console** (optional)

3. **That's it!** The single file handles everything.

## Advantages Over Branch-Specific Files

| Approach | Pros | Cons |
|----------|------|------|
| **Unified amplify.yml** | ✅ No git conflicts<br>✅ Single source of truth<br>✅ Easy maintenance | None significant |
| Branch-specific files | ✅ Explicit separation | ❌ Git conflicts<br>❌ More files to maintain<br>❌ Requires Amplify Console override |

## Troubleshooting

**Q: Environment variables not working?**  
A: Check that they're set in Amplify Console → Branch → Environment variables

**Q: Wrong branch detected?**  
A: `AWS_BRANCH` is automatically set by Amplify. Verify branch name matches exactly (case-sensitive)

**Q: Want to override defaults?**  
A: Set environment variables in Amplify Console - they take precedence over defaults

## Migration from Branch-Specific Files

If you were using `amplify-main.yml` and `amplify-bsl2025.yml`:

1. ✅ Already done - unified `amplify.yml` is in place
2. ✅ Environment variables can be set in Amplify Console if needed
3. ✅ Old branch-specific files can be kept as reference but aren't needed

