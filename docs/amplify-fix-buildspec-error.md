# Fix: Missing frontend definition in buildspec

## Problem
Amplify is trying to use `buildspec.yml` (CodeBuild format) instead of `amplify.yml`. This happens when:
1. Amplify app is configured to use CodeBuild
2. The buildspec.yml file doesn't exist or is malformed
3. Amplify can't find the amplify.yml file

## Solution 1: Switch Amplify to use amplify.yml (Recommended)

1. **Go to AWS Amplify Console**
2. **Select your app** → **App settings** → **Build settings**
3. **Click "Edit"** on the build specification
4. **Change build specification** from `buildspec.yml` to `amplify.yml`
5. **Or copy the content** from `amplify-main.yml` or `amplify-bsl2025.yml` based on your branch
6. **Save and redeploy**

## Solution 2: Create buildspec.yml (If CodeBuild is required)

If you must use CodeBuild, create a `buildspec.yml` file:

```yaml
version: 0.2
phases:
  pre_build:
    commands:
      - echo "Using amplify.yml configuration"
      - cat amplify.yml
  build:
    commands:
      - echo "Build phase - Amplify will handle this"
artifacts:
  files:
    - '**/*'
```

But **this is not recommended** - use Solution 1 instead.

## Solution 3: Ensure amplify.yml is in Repository Root

Make sure `amplify.yml` is in the root of your repository:
- ✅ `amplify.yml` (in root)
- ❌ `some-folder/amplify.yml` (wrong location)

## Quick Fix Steps

1. **Verify amplify.yml exists** in your repository root
2. **In Amplify Console** → Your App → **Build settings**
3. **Check "Build specification"** - should say `amplify.yml`
4. **If it says `buildspec.yml`**, change it to `amplify.yml`
5. **Copy content** from `amplify-main.yml` (for main branch) or `amplify-bsl2025.yml` (for bsl2025 branch)
6. **Save and trigger a new build**

## For edcalderon/hashpass.tech Repository

If you're deploying from `edcalderon/hashpass.tech`:

1. Ensure `amplify.yml` is committed to the repository
2. In Amplify Console, verify the app is using `amplify.yml` not `buildspec.yml`
3. Use the appropriate config:
   - **Main branch** → Use `amplify-main.yml` content
   - **bsl2025 branch** → Use `amplify-bsl2025.yml` content

## Verification

After fixing, check the build logs. You should see:
```
# Starting environment caching...
# Building the application...
# Running build commands...
```

Instead of:
```
!!! CustomerError: Missing frontend definition in buildspec
```

