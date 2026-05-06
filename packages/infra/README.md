# HashPass Infra

This workspace package is the first SST-based replacement layer for Amplify.

It wraps the upstream `@lsts_tech/infra` package, which provides the `infra`
CLI, and keeps the BSL web app deployment config in one place.

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

`dev` and `deploy:*` wrap the SST CLI directly. `doctor` wraps the
`@lsts_tech/infra` readiness checks for AWS, DNS, and pipeline setup.

## CI/CD

GitHub Actions can deploy the package with AWS OIDC. The workflow in
`.github/workflows/infra-deploy.yml` targets:

- `develop` -> `dev`
- `main` -> `production`

Before the first run, bootstrap a role with:

```bash
REPO=<org>/<repo> ./tools/scripts/setup-infra-role.sh
```

The site build uses `expo export -p web --no-ssg`, which still bundles the app
for the browser, but does not pre-render routes or start a runtime server in AWS.
The CodeBuild projects are seeded with the public Supabase variables from the
root `.env` so the export can bundle the client correctly:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_KEY`

See [docs/INFRA_NAMING_GUIDE.md](/home/ed/Documents/HASH/hashpass.tech/docs/INFRA_NAMING_GUIDE.md) for the resource naming convention used by the BSL infra track.
