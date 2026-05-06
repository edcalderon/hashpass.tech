# Shared scripts

Shared build/deploy scripts used across apps in the monorepo.

Use `tools/scripts/` as the primary location for app-specific and Lambda/deploy scripts (e.g. `package-lambda.sh`, `update-sw-version.mjs`). Reference these from root or app-level scripts as needed.

## Multi-tenant deployment config

Tenant deployment metadata is centralized in:

- `tools/scripts/config/tenants.json`

Current tenants:

- `core` (`hashpass.tech`, Amplify `dy8duury54wam` / `us-east-2`)
- `blockchainsummit` (`blockchainsummit.hashpass.lat`, Amplify `d951nuj7hrqeg` / `sa-east-1`)

Shared branch cadence:

- `develop` for development
- `main` for production

### Scripts using tenant config

- `tools/scripts/check-consistency.js`
- `tools/scripts/apply-amplify-custom-headers.sh`
- `tools/scripts/release-pipeline.js`
- `tools/scripts/release-infra-pipeline.js`
- `tools/scripts/provision-infra-connection.sh`
- `tools/scripts/provision-infra-pipelines.sh`
- `tools/scripts/test-release-infra-flow.sh`
- `tools/scripts/propagate-env.js` (for `dev`/`production`)
- `tools/scripts/sync-env.js`

Examples:

```bash
node tools/scripts/check-consistency.js --all-tenants --env development
node tools/scripts/check-consistency.js --tenant core --prod
tools/scripts/apply-amplify-custom-headers.sh --tenant core
tools/scripts/apply-amplify-custom-headers.sh --tenant blockchainsummit
node tools/scripts/release-pipeline.js --env development
node tools/scripts/release-pipeline.js --env production --bump minor
node tools/scripts/release-infra-pipeline.js --env production --bump patch
tools/scripts/provision-infra-connection.sh owner/repo
tools/scripts/provision-infra-pipelines.sh owner/repo
tools/scripts/test-release-infra-flow.sh production patch
node tools/scripts/propagate-env.js dev --tenant blockchainsummit
node tools/scripts/sync-env.js production --tenant core
```

Infra helpers derive the AWS account from active credentials unless `AWS_ACCOUNT_ID` or `EXPECTED_AWS_ACCOUNT_ID` is set in the environment or repository variables.
See `docs/INFRA_NAMING_GUIDE.md` for the naming convention used by the new BSL infra resources.

### Environment safety guards

For non-local `dev`/`production` propagation and AWS sync:

- Canonical URLs are enforced from `tools/scripts/config/tenants.json`:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `DIRECTUS_URL`
  - `EXPO_PUBLIC_DIRECTUS_URL`
  - `EXPO_PUBLIC_API_BASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` must decode to the expected Supabase project ref for the target environment, otherwise scripts fail fast.

When using different Supabase projects per environment, provide both key variants in root `.env`:

- `SUPABASE_SERVICE_ROLE_KEY_DEV` / `SUPABASE_SERVICE_ROLE_KEY_PROD`
- `EXPO_PUBLIC_SUPABASE_KEY_DEV` / `EXPO_PUBLIC_SUPABASE_KEY_PROD`
