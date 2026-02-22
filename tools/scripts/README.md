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

Examples:

```bash
node tools/scripts/check-consistency.js --all-tenants --env development
node tools/scripts/check-consistency.js --tenant core --prod
tools/scripts/apply-amplify-custom-headers.sh --tenant core
tools/scripts/apply-amplify-custom-headers.sh --tenant blockchainsummit
```
