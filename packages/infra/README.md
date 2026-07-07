# HASHPASS Infra

This workspace package now owns the live AWS/GCP delivery surfaces for the monorepo:

- the source-account CloudFront front door for `hashpass.tech` and `dev.hashpass.tech`
- the target-account `hashpass.tech` hosted zones, static site origin, and API stack
- the BSL SST delivery path for `bsl.hashpass.tech` and `bsl-dev.hashpass.tech`
- the GitHub Pages artifact and DNS aliases for `hashpass.club` and `hashpass.club/documentation`
- the mobile Android self-hosted runner stack for `hashpass-mobile-release`
- the isolated target-account Android runner stack for `hashpass-mobile-release-target`

The dev and deploy scripts call the SST CLI directly for the BSL path, while the club Pages build uses this package as the static artifact source and GitHub Actions handles publication. `doctor` wraps the upstream `@lsts_tech/infra` readiness checks.

Set `HASHPASS_INFRA_TARGET=club-docs` only if you need to inspect the archived SST club front-door target. The active club site is the GitHub Pages artifact assembled from `apps/web-app` and `apps/docs`.

## What it deploys

- `bsl.hashpass.tech` for production
- `bsl-dev.hashpass.tech` for development
- `packages/infra/terraform/stacks/hashpass-dns` as the target-account hosted zone layer that keeps the migration reversible until registrar cutover, with `dev.hashpass.tech` living inside the parent `hashpass.tech` zone
- `packages/infra/terraform/stacks/hashpass-api-target` as the target-account API Gateway + Lambda layer for `api.hashpass.tech` and `api-dev.hashpass.tech`
- `packages/infra/terraform/stacks/hashpass-web` as the target-account `hashpass.tech` and `dev.hashpass.tech` CodePipeline + EC2 worker stack that publishes the static origins consumed by the source CloudFront front door
- `hashpass.club` as the canonical club site, with `club.hashpass.tech` and `docs.hashpass.tech` as DNS aliases
- `apps/web-app` and `apps/docs` assembled into a single combined static artifact for GitHub Pages
- `packages/infra/terraform/stacks/mobile-release` as the AWS EC2 GitHub Actions runner for mobile Android builds, including its managed public VPC when the account has no default network
- `packages/infra/terraform/stacks/mobile-release-target` as the target-account Android runner used during the migration; it uses the distinct `hashpass-mobile-release-target` label so it does not compete with the source runner

## Commands

```bash
pnpm --filter @hashpass/infra run dev
pnpm --filter @hashpass/infra run deploy:dev
pnpm --filter @hashpass/infra run deploy:prod
pnpm --filter @hashpass/infra run deploy:club-docs:prod # legacy AWS path
pnpm --filter @hashpass/infra run doctor
pnpm run infra:hashpass-web:plan
pnpm run infra:hashpass-web:apply
pnpm run infra:mobile-release:plan
pnpm run infra:mobile-release:apply
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
as their CodeBuild buildspec. The active CodeBuild path sets `CI=1` before
dependency installation so Husky `prepare` hooks do not run against source
archives that do not contain `.git` metadata. Production BSL should use the
BSL-specific variables first:

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
