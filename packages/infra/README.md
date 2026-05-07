# HashPass Infra

This workspace package is the first SST-based replacement layer for Amplify.

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
REPO=<org>/<repo> ./tools/scripts/setup-infra-role.sh
```

The site build uses `expo export -p web` with the Expo web output set to
`static`, so SST only uploads the client bundle and does not spend time
building the API route server tree. The CodeBuild projects are seeded with the
public Supabase variables from the root `.env` so the export can bundle the
client correctly:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_KEY`

See [docs/INFRA_NAMING_GUIDE.md](/home/ed/Documents/HASH/hashpass.tech/docs/INFRA_NAMING_GUIDE.md) for the resource naming convention used by the BSL infra track.
