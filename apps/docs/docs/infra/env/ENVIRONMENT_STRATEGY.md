# HASHPASS Environment Strategy & Management

This document outlines the standardized approach for managing environment variables, configurations, and secrets across the HASHPASS project.

## 1. Environment Profiles

We use a strictly standardized set of environment profiles to ensure consistency between developer machines and AWS infrastructure.

| Profile | Purpose | Secret namespace | Example Base URL |
| :--- | :--- | :--- | :--- |
| **`local`** | Personal development on your machine. | local `.env` only | `http://localhost:8055` |
| **`dev`** | Shared staging/development. | Secrets Management `hashpass-dev` | `https://sso-dev.hashpass.co` |
| **`production`**| Live production environment. | Secrets Management `hashpass-production` | `https://sso.hashpass.co` |

> Deployment split:
> - `hashpass.tech` / `core` is served through the source-account CloudFront front door, which points at the target-account static origin while the legacy Amplify app is retired.
> - `dev.hashpass.tech` uses the same front-door pattern for the development pipeline so the public dev hostname stays HTTPS-only.
> - The target web pipeline also packages and updates the Expo Router API Lambda, then verifies `/api/config/versions` so stale API code fails the deploy.
> - `hashpass.club` is the standalone static Next.js app in `apps/web-app`; `packages/infra` assembles it together with `apps/docs` into a single Pages artifact and serves it at `https://hashpass.club`.
> - `https://hashpass.club/documentation/` serves the Docusaurus build from `apps/docs`.
> - `club.hashpass.tech` and `docs.hashpass.tech` are Route53 aliases that canonicalize to the GitHub Pages origin.
> - `bsl.hashpass.tech` / `bsl` uses the SST/CodeBuild pipeline (`bsl-hashpass-dev-build`, `bsl-hashpass-prod-build`) with `packages/tools/buildspecs/infra-deploy.yml`.
> - `blockchainsummit.hashpass.lat` is a separate legacy Amplify tenant kept for the event track.
> - BSL Better Auth secrets are normalized under `/hashpass/[env]/bsl/better-auth/`, and the sync helpers keep both `EXPO_PUBLIC_SUPABASE_KEY` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` aligned for browser compatibility.

---

## 2. The source of truth

The **HASHPASS Secrets Management project `hashpass-6d6h`** is the source of
truth for shared and runtime secrets. Its environments are `hashpass-dev` and
`hashpass-production`. The root `.env` is only a local-development projection
and must never be treated as the authoritative store. It contains:
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

### B. `sync-env.js` (secret provider → AWS Lambda)
Resolves the repository root from `packages/tools/scripts/` and synchronizes
critical environment variables to AWS Lambda functions. New secret values must
come from Secrets Management; do not add new values to AWS SSM/KMS.
```bash
# Syncs _DEV overrides to hashpass-dev-expo-router-api
node packages/tools/scripts/sync-env.js dev

# Syncs _PROD overrides to hashpass-prod-expo-router-api
node packages/tools/scripts/sync-env.js production
```
- **Security Rule**: `local` profile is blocked from syncing to AWS.

### C. Legacy `setup-parameters.sh` (AWS SSM compatibility)
Manages existing AWS SSM compatibility values only. Do not use it to create
new secrets or parameters during the cutover.
```bash
# Recommended: Create/Update parameters and delete stale ones
bash packages/tools/scripts/util/setup-parameters.sh sync [dev|production]

# Other commands: list, verify, delete
```
- **Legacy namespace**: Existing parameters remain under `/hashpass/[env]/`.
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
# 3. Resolve new secrets from Secrets Management, then update Production Lambda
node packages/tools/scripts/sync-env.js production
# 4. Do not create new SSM parameters; update legacy values only when required
bash packages/tools/scripts/util/setup-parameters.sh sync production
```

---

## 5. Security Best Practices
1. **Never commit `.env`**: The root `.env` contains secrets. it is in `.gitignore`. Use `.env.example` to document keys.
2. **Blocked Local Sync**: Our tools are hardened to prevent `localhost` values from being pushed to AWS via the `local` target.
3. **New secret policy**: Create new secrets in the matching Secrets
   Management environment. Never commit provider tokens or plaintext values.
4. **Legacy isolation**: Keep AWS SSM `/hashpass/dev/` and
   `/hashpass/production/` as compatibility paths until migration is approved;
   do not delete them during this cutover.
