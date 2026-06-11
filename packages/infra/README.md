# HashPass Infra

This workspace package now manages the BSL AWS delivery path plus the club Pages build and DNS layer:

- the existing BSL SST pipeline for `bsl.hashpass.tech`
- the club Pages artifact for `hashpass.club` and `hashpass.club/documentation`
- the Route53 records for `club.hashpass.tech` and `docs.hashpass.tech`

The dev and deploy scripts call the SST CLI directly for the BSL path, while the club Pages build uses this package as the static artifact source and GitHub Actions handles publication. `doctor` wraps the upstream `@lsts_tech/infra` readiness checks.

Set `HASHPASS_INFRA_TARGET=club-docs` when you want the legacy SST club front door instead of the BSL stack. The GitHub Pages workflow now publishes the canonical club site and this package only builds the combined static artifact plus DNS records for it.

## What it deploys

- `bsl.hashpass.tech` for production
- `bsl-dev.hashpass.tech` for development
- `apps/mobile-app` as an SST `StaticSite`
- `hashpass.club` as the canonical club site, with `club.hashpass.tech` and `docs.hashpass.tech` as DNS aliases
- `apps/web-app` and `apps/docs` assembled into a single combined static artifact for GitHub Pages

## Commands

```bash
pnpm --filter @hashpass/infra run dev
pnpm --filter @hashpass/infra run deploy:dev
pnpm --filter @hashpass/infra run deploy:prod
pnpm --filter @hashpass/infra run deploy:club-docs:prod # legacy AWS path
pnpm --filter @hashpass/infra run doctor
```

## CI/CD

GitHub Actions can deploy the package with AWS OIDC. The workflows target:

- `.github/workflows/infra-deploy.yml` for the BSL target:
  - `develop` -> `dev`
  - `main` -> `production`
- `.github/workflows/deploy-club-docs.yml` for the club Pages site:
  - push tag `club-v*`
  - pushes that touch the club/docs source tree
  - publishes the combined static artifact to GitHub Pages

Before the first run, bootstrap a role with:

```bash
REPO=<org>/<repo> ./packages/tools/scripts/setup-infra-role.sh
```

The BSL site build uses `expo export -p web` with the Expo web output set to
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

See [apps/docs/docs/infra/INFRA_NAMING_GUIDE.md](../../apps/docs/docs/infra/INFRA_NAMING_GUIDE.md) for the resource naming convention used by the BSL infra track.
