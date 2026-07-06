# Shared scripts

Shared build/deploy scripts used across apps in the monorepo.

Use `packages/tools/scripts/` as the primary location for app-specific and Lambda/deploy scripts (e.g. `package-lambda.sh`, `update-sw-version.mjs`). These scripts resolve the repository root from `packages/tools/scripts/`, so keep path joins rooted at the repo root, not `packages/`.
Legacy hosting helpers have been moved to [`archive/amplify/scripts/`](../../archive/amplify/scripts/) and are preserved there as deprecated reference material only.

## Multi-tenant deployment config

Tenant deployment metadata is centralized in:

- `packages/tools/scripts/config/tenants.json`

Current tenants:

- `core` (`hashpass.tech`, legacy tenant `dy8duury54wam` / `us-east-2`)
- `club` (`hashpass.club`, Next.js tenant; app id comes from its env var)
- `club-dev` (`club-dev.hashpass.tech`, Next.js tenant; app id comes from its env var)
- `bsl` (`bsl.hashpass.tech`, SST/CodeBuild pipeline, `bsl-hashpass-dev-build` / `bsl-hashpass-prod-build`)
- `blockchainsummit` (`blockchainsummit.hashpass.lat`, legacy tenant `d951nuj7hrqeg` / `sa-east-1`)

Shared branch cadence:

- `develop` for development
- `main` for production

Release flow:

- `release` / `release:patch` / `release:minor` / `release:major` run the branch-aware version release flow for the repo root
- `release:promote` promotes a `develop` release onto `main`
- `release:pipeline` remains the tenant/deploy pipeline for infra and legacy work
- `release:dev` / `release:prod` target `core` by default
- `release:bsl:dev` / `release:bsl:prod` follow the event tenant path and remain available for the historical branch-aware release flow
- `release:club:web` / `release:club:web:patch` run the club web app patch release flow and emit `club-vX.Y.Z` tags
- `release:club` / `release:club-dev` target the standalone Next.js app pipelines
- `release:all:dev` / `release:all:prod` fan out to every configured tenant only when you ask for it, including the club tenants once their app ids are configured

BSL deployment and sync helpers use the `/hashpass/[env]/` SSM namespace. Keep those scripts separate from the legacy `core` track. The same sync flow also normalizes `/hashpass/[env]/bsl/better-auth/` and keeps `EXPO_PUBLIC_SUPABASE_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` aligned for browser compatibility. `packages/tools/scripts/propagate-env.js` and `packages/tools/scripts/sync-env.js` both resolve the repo root before writing files or syncing AWS state.

The branch-aware release flow:

- Detects the current branch automatically
- Runs `versioning check-secrets`, `versioning cleanup scan`, and `versioning validate`
- Uses `@edcalderon/versioning` to create the changelog, version commit, and git tag
- Uses the repo-owned `update-readme` wrapper so the latest-changes block and GitHub releases link stay on this repository
- `pnpm run readme:check` is the Husky pre-commit guard that blocks stale README/changelog pairs before a release commit lands
- Pushes the current branch with `--follow-tags`
- Can optionally promote a `develop` release to `main`

Mobile Android releases now reuse the same backend switch:

- `pnpm run android:release` and `pnpm run android:release:dev` honor `MOBILE_RELEASE_BACKEND`, defaulting to fastlane so the same command can run on the self-hosted runner
- `pnpm run android:release:alpha` submits the development-profile build path to the Play Console alpha closed-testing track and is blocked until a successful internal release exists for the same tag
- The Android workflow can auto-dispatch alpha after internal when `auto_promote_alpha=true`; leave `alpha_release_status` at `completed` for the normal direct-publish path and set it to `draft` only if Play still treats the app as draft
- If the Play Console app is still a draft, set `FASTLANE_RELEASE_STATUS=draft` for the first alpha closed-testing upload; otherwise keep `completed` and let the workflow publish directly
- `pnpm run android:release:fastlane` and `pnpm run android:release:fastlane:dev` force the self-hosted fastlane path
- The self-hosted workflow lives in `.github/workflows/mobile-android-release.yml`, expects the `hashpass-mobile-release` AWS runner label, and now accepts development/internal and development/alpha releases while production is paused. Closed alpha cannot run until internal has already succeeded for the same tag.
- The workflow also prefers Expo build credentials whose SHA-1 matches the `ANDROID_UPLOAD_KEY_SHA1` repository variable before falling back to the default Expo credential
- Fastlane requires the Play service account JSON plus `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`; the GitHub Actions release workflow resolves those signing values from Expo before invoking Fastlane

### Scripts using tenant config

- `packages/tools/scripts/check-consistency.js`
- `packages/tools/scripts/setup-infra-role.sh`
- `packages/tools/scripts/setup-github-actions-role.sh`
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
packages/tools/scripts/setup-infra-role.sh hashpass-tech/hashpass.tech
node packages/tools/scripts/release.js patch
node packages/tools/scripts/release.js minor --promote
node packages/tools/scripts/release.js major --branch main
node packages/tools/scripts/release-club-web.js patch --branch main
node packages/tools/scripts/release-pipeline.js --env development
node packages/tools/scripts/release-pipeline.js --env production --tenant core --bump minor
node packages/tools/scripts/release-pipeline.js --env production --tenant blockchainsummit --bump minor
node packages/tools/scripts/release-pipeline.js --env production --tenant club --dry-run
node packages/tools/scripts/release-pipeline.js --env development --tenant club-dev --dry-run
node packages/tools/scripts/release-pipeline.js --env production --all-tenants --bump minor
node packages/tools/scripts/release-infra-pipeline.js --env production --bump patch
packages/tools/scripts/provision-infra-connection.sh hashpass-tech/hashpass.tech
packages/tools/scripts/provision-infra-pipelines.sh hashpass-tech/hashpass.tech
packages/tools/scripts/setup-github-actions-role.sh hashpass-tech/hashpass.tech
packages/tools/scripts/build-static-site.sh
packages/tools/scripts/deploy-static-site.sh
packages/tools/scripts/test-release-infra-flow.sh production patch
node packages/tools/scripts/propagate-env.js dev --tenant blockchainsummit
node packages/tools/scripts/sync-env.js production --tenant core
```

Archived Amplify helpers:

- `archive/amplify/scripts/add-lambda-permissions-to-amplify-role.sh`
- `archive/amplify/scripts/apply-amplify-custom-headers.sh`
- `archive/amplify/scripts/update-amplify-source-repo.sh`
- `archive/amplify/scripts/setup-amplify.sh`
- `archive/amplify/scripts/delete-amplify-api-app.sh`
- `archive/amplify/scripts/deploy-lambda-from-amplify.sh`
- `archive/amplify/scripts/util/amplify-deploy.sh`
- `archive/amplify/scripts/util/build-and-deploy.sh`

Those scripts still describe the retired Amplify flow, but they are no longer part of the active deployment path. Treat them as reference only.

Infra helpers derive the AWS account from active credentials unless `TARGET_AWS_ACCOUNT_ID`, `AWS_ACCOUNT_ID`, or `EXPECTED_AWS_ACCOUNT_ID` is set in the environment or repository variables.
See `apps/docs/docs/infra/INFRA_NAMING_GUIDE.md` for the naming convention used by the new BSL infra resources.

The static site deploy helper expects `SITE_BUCKET_NAME` and, optionally, `SITE_CLOUDFRONT_DISTRIBUTION_ID`. It syncs the built `dist/client` tree to S3, reapplies no-cache headers to HTML and manifest assets, and creates a CloudFront invalidation when a distribution ID is present.
If only `SITE_CLOUDFRONT_DOMAIN_NAME` is available, the helper resolves the distribution ID at runtime with `aws cloudfront list-distributions` and then invalidates the matching distribution. That keeps the target web pipeline usable without feeding Terraform a self-referential distribution ID.
The static site build helper installs the project dependencies, resolves the pinned pnpm version from the repo root, and produces the `dist/client` tree that the deploy helper consumes. It also resets the workspace-local Expo / Metro cache before export so the EC2 worker cannot reuse stale absolute paths from a previous job. The shared EC2 CodePipeline worker now runs the build helper directly before invoking the deploy helper in direct mode.
The worker also retries the source artifact download once the CodePipeline job starts, then verifies the archive exists before unzipping it. If the build helper is missing from a source archive, the worker falls back to the same inline pnpm build flow so the pipeline remains usable even when the archive is incomplete.
The web pipeline monitor script keeps the shared EC2 worker warm while either
`hashpass-dev-site` or `hashpass-production-site` is active, then stops the
worker after a quiet grace period once both pipelines are idle. It is designed
to pair with the GitHub Actions OIDC role emitted by the `hashpass-web` stack.
The workflow now also runs a periodic stop sweep so an idle worker can still be
reclaimed even if no new push arrives after the final build.
Use `.github/workflows/hashpass-web-pipeline-monitor.yml` as the normal
control plane instead of reaching into the target AWS account with the CLI.
That workflow needs `AWS_WEB_PIPELINE_ROLE_ARN`, `AWS_WEB_PIPELINE_REGION`,
and optionally the `WEB_PIPELINE_*` repo variables for custom pipeline names or
worker tags.

```bash
gh workflow run hashpass-web-pipeline-monitor.yml -f mode=monitor
gh workflow run hashpass-web-pipeline-monitor.yml -f mode=stop
```

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
