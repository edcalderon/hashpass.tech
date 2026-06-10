# Shared scripts

Shared build/deploy scripts used across apps in the monorepo.

Use `packages/tools/scripts/` as the primary location for app-specific and Lambda/deploy scripts (e.g. `package-lambda.sh`, `update-sw-version.mjs`). These scripts resolve the repository root from `packages/tools/scripts/`, so keep path joins rooted at the repo root, not `packages/`.

## Multi-tenant deployment config

Tenant deployment metadata is centralized in:

- `packages/tools/scripts/config/tenants.json`

Current tenants:

- `core` (`hashpass.tech`, Amplify `dy8duury54wam` / `us-east-2`)
- `bsl` (`bsl.hashpass.tech`, SST/CodeBuild pipeline, `bsl-hashpass-dev-build` / `bsl-hashpass-prod-build`)
- `blockchainsummit` (`blockchainsummit.hashpass.lat`, legacy Amplify tenant `d951nuj7hrqeg` / `sa-east-1`)

Shared branch cadence:

- `develop` for development
- `main` for production

Release flow:

- `release` / `release:patch` / `release:minor` / `release:major` run the branch-aware version release flow for the repo root
- `release:promote` promotes a `develop` release onto `main`
- `release:pipeline` remains the tenant/deploy pipeline for infra and Amplify work
- `release:dev` / `release:prod` target `core` by default
- `release:bsl:dev` / `release:bsl:prod` follow the event tenant path and remain available for the historical branch-aware release flow
- `release:all:dev` / `release:all:prod` fan out to every configured tenant only when you ask for it

BSL deployment and sync helpers use the `/hashpass/[env]/` SSM namespace. Keep those scripts separate from the Amplify-managed `core` track. The same sync flow also normalizes `/hashpass/[env]/bsl/better-auth/` and keeps `EXPO_PUBLIC_SUPABASE_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` aligned for browser compatibility. `packages/tools/scripts/propagate-env.js` and `packages/tools/scripts/sync-env.js` both resolve the repo root before writing files or syncing AWS state.

The branch-aware release flow:

- Detects the current branch automatically
- Runs `versioning check-secrets`, `versioning cleanup scan`, and `versioning validate`
- Uses `@edcalderon/versioning` to create the changelog, version commit, and git tag
- Pushes the current branch with `--follow-tags`
- Can optionally promote a `develop` release to `main`

### Scripts using tenant config

- `packages/tools/scripts/check-consistency.js`
- `packages/tools/scripts/apply-amplify-custom-headers.sh`
- `packages/tools/scripts/release-pipeline.js`
- `packages/tools/scripts/release-infra-pipeline.js`
- `packages/tools/scripts/provision-infra-connection.sh`
- `packages/tools/scripts/provision-infra-pipelines.sh`
- `packages/tools/scripts/test-release-infra-flow.sh`
- `packages/tools/scripts/propagate-env.js` (for `dev`/`production`)
- `packages/tools/scripts/sync-env.js`

Examples:

```bash
node packages/tools/scripts/check-consistency.js --all-tenants --env development
node packages/tools/scripts/check-consistency.js --tenant core --prod
packages/tools/scripts/apply-amplify-custom-headers.sh --tenant core
packages/tools/scripts/apply-amplify-custom-headers.sh --tenant blockchainsummit
node packages/tools/scripts/release.js patch
node packages/tools/scripts/release.js minor --promote
node packages/tools/scripts/release.js major --branch main
node packages/tools/scripts/release-pipeline.js --env development
node packages/tools/scripts/release-pipeline.js --env production --tenant core --bump minor
node packages/tools/scripts/release-pipeline.js --env production --tenant blockchainsummit --bump minor
node packages/tools/scripts/release-pipeline.js --env production --all-tenants --bump minor
node packages/tools/scripts/release-infra-pipeline.js --env production --bump patch
packages/tools/scripts/provision-infra-connection.sh owner/repo
packages/tools/scripts/provision-infra-pipelines.sh owner/repo
packages/tools/scripts/test-release-infra-flow.sh production patch
node packages/tools/scripts/propagate-env.js dev --tenant blockchainsummit
node packages/tools/scripts/sync-env.js production --tenant core
```

Infra helpers derive the AWS account from active credentials unless `AWS_ACCOUNT_ID` or `EXPECTED_AWS_ACCOUNT_ID` is set in the environment or repository variables.
See `docs/INFRA_NAMING_GUIDE.md` for the naming convention used by the new BSL infra resources.

### Environment safety guards

For non-local `dev`/`production` propagation and AWS sync:

- Canonical URLs are enforced from `packages/tools/scripts/config/tenants.json`:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `DIRECTUS_URL`
  - `EXPO_PUBLIC_DIRECTUS_URL`
  - `EXPO_PUBLIC_API_BASE_URL`
- Tenant-specific Supabase aliases are also materialized when configured:
  - `EXPO_PUBLIC_BSL_SUPABASE_URL_DEV` / `EXPO_PUBLIC_BSL_SUPABASE_URL_PROD`
  - `EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV` / `EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD`
  - `BSL_SUPABASE_SERVICE_ROLE_KEY_DEV` / `BSL_SUPABASE_SERVICE_ROLE_KEY_PROD`
  - `BSL_SUPABASE_DB_URL_DEV` / `BSL_SUPABASE_DB_URL_PROD`
- `SUPABASE_SERVICE_ROLE_KEY` must decode to the expected Supabase project ref for the target environment, otherwise scripts fail fast.

When using different Supabase projects per environment, provide the matching tenant aliases in root `.env`:

- `EXPO_PUBLIC_SUPABASE_KEY_DEV` / `EXPO_PUBLIC_SUPABASE_KEY_PROD`
- `SUPABASE_SERVICE_ROLE_KEY_DEV` / `SUPABASE_SERVICE_ROLE_KEY_PROD`
- `EXPO_PUBLIC_BSL_SUPABASE_URL_DEV` / `EXPO_PUBLIC_BSL_SUPABASE_URL_PROD`
- `EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV` / `EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD`
- `BSL_SUPABASE_SERVICE_ROLE_KEY_DEV` / `BSL_SUPABASE_SERVICE_ROLE_KEY_PROD`
- `BSL_SUPABASE_DB_URL_DEV` / `BSL_SUPABASE_DB_URL_PROD`
