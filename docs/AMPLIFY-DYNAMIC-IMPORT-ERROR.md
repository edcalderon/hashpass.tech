# Fix: "A dynamic import callback was not specified" Error

## Problem

Amplify build fails with:
```
✖ Initializing your environment: dev
✖ There was an error initializing your environment.
🛑 Could not initialize platform for 'dev': A dynamic import callback was not specified.
```

## Root Cause

Amplify Console is detecting the `amplify/` folder and attempting to automatically initialize the Amplify CLI environment, but:
1. The project uses Amplify only for hosting (static site), not full backend
2. Amplify CLI initialization is failing due to configuration issues
3. The build doesn't actually need Amplify CLI initialization

## Solution

Since this project uses Amplify only for hosting static files (Expo web build), we don't need Amplify CLI to initialize the environment. The build should proceed as a simple static site deployment.

### Option 1: Disable Amplify CLI Auto-Initialization (Recommended)

Add this to `amplify.yml` in the `preBuild` phase to prevent Amplify from auto-initializing:

```yaml
preBuild:
  commands:
    # ... existing commands ...
    - export AMPLIFY_DISABLE_TS=true
    - export AMPLIFY_SKIP_BACKEND_BUILD=true
    - 'echo "Skipping Amplify CLI initialization for static hosting"'
```

### Option 2: Configure Amplify to Skip Backend

In AWS Amplify Console:
1. Go to **App settings** → **Build settings**
2. Under **Build image settings**, ensure:
   - **Build image** is set to a standard image (not custom)
   - **Compute** is set appropriately

3. Add environment variable:
   - Name: `AMPLIFY_SKIP_BACKEND_BUILD`
   - Value: `true`

### Option 3: Remove or Rename Amplify Folder (If Not Needed)

If the `amplify/` folder is not needed for the build process:

1. **Check if `amplify/` folder is used:**
   - Review `amplify.yml` - it copies files to `amplify/backend/function/bslApi/`
   - If this is needed, keep the folder
   - If not needed, consider moving it

2. **If not needed, rename it:**
   ```bash
   mv amplify amplify-backend-config
   ```
   Update `amplify.yml` if it references this folder.

### Option 4: Fix Amplify CLI Configuration

If you need Amplify CLI functionality:

1. **Install Amplify CLI in build:**
   ```yaml
   preBuild:
     commands:
       - npm install -g @aws-amplify/cli@latest
   ```

2. **Initialize with correct configuration:**
   ```yaml
   preBuild:
     commands:
       - amplify configure project
       - amplify env checkout dev || echo "Environment already configured"
   ```

## Recommended Fix for This Project

Since this is a static Expo web build, we use **Option 3** (permanently renaming the folder):

**SOLUTION IMPLEMENTED:** The `amplify/` folder has been **permanently renamed** to `amplify-backend-config/` in the repository. This prevents Amplify CLI from auto-detecting it, as it only looks for folders named exactly `amplify/`.

### Changes Made:

1. **Folder renamed:** `amplify/` → `amplify-backend-config/`
2. **Updated `amplify.yml`:** All references updated to use `amplify-backend-config/`
3. **Updated scripts:** `deploy-bslatam.sh` updated with new folder name

### Why This Works:

- Amplify CLI only auto-detects folders named exactly `amplify/`
- By renaming to `amplify-backend-config/`, Amplify Console will not attempt initialization
- The folder structure and functionality remain the same, just with a different name
- This is a permanent solution that doesn't require any build-time renaming

### Current Configuration:

```yaml
version: 1.0
frontend:
  phases:
    preBuild:
      commands:
        # Note: amplify/ folder renamed to amplify-backend-config/ to prevent auto-init
        - 'echo "Using amplify-backend-config/ folder"'
        # ... rest of preBuild commands ...
    build:
      commands:
        # Use amplify-backend-config/ instead of amplify/
        - mkdir -p amplify-backend-config/backend/function/bslApi/...
        # ... rest of build commands ...
```

## Verification

After applying the fix:

1. **Trigger a new build** in Amplify Console
2. **Check build logs** - should not see "Initializing your environment" errors
3. **Verify build completes** successfully
4. **Test deployed site** to ensure it works correctly

## Additional Notes

- The `amplify/` folder contains backend configuration for Lambda functions
- If you're using Lambda functions, you may need Amplify CLI
- For pure static hosting, Amplify CLI initialization is not required
- The error occurs because Amplify detects the folder and tries to initialize, but the configuration is incomplete

## References

- [Amplify Hosting Documentation](https://docs.aws.amazon.com/amplify/latest/userguide/getting-started.html)
- [Amplify CLI Troubleshooting](https://docs.aws.amazon.com/amplify/latest/userguide/cli-troubleshooting.html)

