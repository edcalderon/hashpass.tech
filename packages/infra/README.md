# HashPass Infra

This workspace package manages the BSL SST-based pipeline that replaces the legacy Amplify path for `bsl.hashpass.tech`.

The main `hashpass.tech` app still follows the separate Amplify track documented in the repo root.

It keeps the BSL web app deployment config in one place. The dev and deploy
scripts call the SST CLI directly, while `doctor` wraps the upstream
`@lsts_tech/infra` readiness checks.

## What it deploys

- `bsl.hashpass.tech` for production
- `bsl-dev.hashpass.tech` for development
- `apps/web-app` as an SST `StaticSite`

## Commands

```bash
pnpm --filter @hashpass/infra run dev
pnpm --filter @hashpass/infra run deploy:dev
pnpm --filter @hashpass/infra run deploy:prod
pnpm --filter @hashpass/infra run doctor
```

## CI/CD

GitHub Actions can deploy the package with AWS OIDC. The workflow in
`.github/workflows/infra-deploy.yml` targets:

- `develop` -> `dev`
- `main` -> `production`

Before the first run, bootstrap a role with:

```bash
REPO=<org>/<repo> ./packages/tools/scripts/setup-infra-role.sh
```

The site build uses `expo export -p web` with the Expo web output set to
`static`, so SST only uploads the client bundle and does not spend time
building the API route server tree. The CodeBuild projects are seeded with the
public Supabase variables from the root `.env` so the export can bundle the
client correctly. The live BSL projects use `packages/tools/buildspecs/infra-deploy.yml`
as their CodeBuild buildspec. Both the Amplify and CodeBuild build paths set
`CI=1` before dependency installation so Husky `prepare` hooks do not run
against source archives that do not contain `.git` metadata. Production BSL
should use the BSL-specific variables first:

- `EXPO_PUBLIC_BSL_SUPABASE_URL_PROD`
- `EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD`
- `EXPO_PUBLIC_BSL_SUPABASE_URL_DEV`
- `EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV`
- `BSL_SUPABASE_SERVICE_ROLE_KEY_PROD`
- `BSL_SUPABASE_SERVICE_ROLE_KEY_DEV`
- `BSL_SUPABASE_DB_URL_PROD`
- `BSL_SUPABASE_DB_URL_DEV`

The generic `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` remain as
fallbacks for local development and older CI jobs, but the BSL aliases are now
preferred when they are present in the environment.

See [docs/INFRA_NAMING_GUIDE.md](../../docs/INFRA_NAMING_GUIDE.md) for the resource naming convention used by the BSL infra track.
