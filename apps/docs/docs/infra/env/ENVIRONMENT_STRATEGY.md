# HashPass Environment Strategy & Management

This document outlines the standardized approach for managing environment variables, configurations, and secrets across the HashPass project.

## 1. Environment Profiles

We use a strictly standardized set of environment profiles to ensure consistency between developer machines and AWS infrastructure.

| Profile | Purpose | AWS Namespace/Resource | Example Base URL |
| :--- | :--- | :--- | :--- |
| **`local`** | Personal development on your machine. | **Blocked from AWS** | `http://localhost:8055` |
| **`dev`** | Shared staging/development on AWS. | `/hashpass/dev/` / `*-dev` | `https://sso-dev.hashpass.co` |
| **`production`**| Live production environment on AWS. | `/hashpass/production/` / `*-prod`| `https://sso.hashpass.co` |

> Deployment split:
> - `hashpass.tech` / `core` is served through the source-account CloudFront front door, which points at the target-account static origin while the legacy Amplify app is retired.
> - `hashpass.club` is the standalone static Next.js app in `apps/web-app`; `packages/infra` assembles it together with `apps/docs` into a single Pages artifact and serves it at `https://hashpass.club`.
> - `https://hashpass.club/documentation/` serves the Docusaurus build from `apps/docs`.
> - `club.hashpass.tech` and `docs.hashpass.tech` are Route53 aliases that canonicalize to the GitHub Pages origin.
> - `bsl.hashpass.tech` / `bsl` uses the SST/CodeBuild pipeline (`bsl-hashpass-dev-build`, `bsl-hashpass-prod-build`) with `packages/tools/buildspecs/infra-deploy.yml`.
> - `blockchainsummit.hashpass.lat` is a separate legacy Amplify tenant kept for the event track.
> - BSL Better Auth secrets are normalized under `/hashpass/[env]/bsl/better-auth/`, and the sync helpers keep both `EXPO_PUBLIC_SUPABASE_KEY` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` aligned for browser compatibility.

---

## 2. The "Source of Truth" (`.env`)

The **root `.env` file** is the single source of truth. It contains:
1. **Global Variables**: Used by all environments unless overridden.
2. **Environment Overrides**: Key-value pairs with suffixes like `_DEV` or `_PROD`.

### Naming Convention in `.env`
- **Base Key:** `DIRECTUS_URL=<LOCAL_DIRECTUS_URL>` (Defaults to `local`)
- **Dev Override:** `DIRECTUS_URL_DEV=<DEV_DIRECTUS_URL>`
- **Prod Override:** `DIRECTUS_URL_PROD=<PROD_DIRECTUS_URL>`

---

## 3. Propagation Flow

Environment variables flow from the root to sub-projects and AWS using three main tools:

### A. `propagate-env.js` (Root → Apps)
Resolves the repository root from `packages/tools/scripts/` and distills the root `.env` into environment-specific `.env` files inside `apps/mobile-app`, `apps/directus`, and other Expo/runtime app folders that participate in this flow.
```bash
npm run env:propagate [local|dev|production]
```
- Picks base variables.
- Applies overrides (e.g., if `dev` is targeted, `KEY_DEV` becomes `KEY`).
- Sets `NODE_ENV` and `EXPO_PUBLIC_ENV`.
- The standalone Next.js app in `apps/web-app` does not use this Expo propagation path; it should receive its own deployment envs through the GitHub Pages club build workflow.

### B. `sync-env.js` (Root → AWS Lambda)
Resolves the repository root from `packages/tools/scripts/` and synchronizes critical environment variables directly to AWS Lambda functions.
```bash
# Syncs _DEV overrides to hashpass-api-dev
node packages/tools/scripts/sync-env.js dev

# Syncs _PROD overrides to hashpass-api-prod
node packages/tools/scripts/sync-env.js production
```
- **Security Rule**: `local` profile is blocked from syncing to AWS.

### C. `setup-parameters.sh` (Root → AWS Parameter Store)
Manages secrets and configurations in AWS SSM Parameter Store surgically.
```bash
# Recommended: Create/Update parameters and delete stale ones
bash packages/tools/scripts/util/setup-parameters.sh sync [dev|production]

# Other commands: list, verify, delete
```
- **Namespace**: Parameters are stored under `/hashpass/[env]/`.
- **BSL Better Auth**: The sync command also normalizes the BSL Better Auth subtree under `/hashpass/[env]/bsl/better-auth/`.
- **Surgical Sync**: The `sync` command identifies parameters that exist on AWS but are not in the script's list and deletes them (cleaning "stale" parameters).

---

## 4. Cheat Sheet: Everyday Workflows

### Starting Local Development
```bash
# 1. Ensure root .env is correct
# 2. Propagate local settings
npm run env:propagate local
```

### Updating the AWS Dev/Staging Environment
```bash
# 1. Update root .env with _DEV overrides
# 2. Propagate locally (optional but good for consistency)
npm run env:propagate dev
# 3. Update Lambda configurations
node packages/tools/scripts/sync-env.js dev
# 4. Sync AWS Parameter Store, including BSL Better Auth aliases
bash packages/tools/scripts/util/setup-parameters.sh sync dev
```

### Deploying to Production
```bash
# 1. Ensure _PROD overrides are set in root .env
# 2. Propagate production settings
npm run env:propagate production
# 3. Update Production Lambda
node packages/tools/scripts/sync-env.js production
# 4. Sync Production Parameter Store, including BSL Better Auth aliases
bash packages/tools/scripts/util/setup-parameters.sh sync production
```

---

## 5. Security Best Practices
1. **Never commit `.env`**: The root `.env` contains secrets. it is in `.gitignore`. Use `.env.example` to document keys.
2. **Blocked Local Sync**: Our tools are hardened to prevent `localhost` values from being pushed to AWS via the `local` target.
3. **SecureString**: Secrets like `GOOGLE_CLIENT_SECRET` or `ADMIN_PASSWORD` are automatically stored as `SecureString` in AWS SSM.
4. **Namespace Isolation**: Environments are strictly separated by paths (`/dev/` vs `/production/`) to prevent accidental crosstalk.
