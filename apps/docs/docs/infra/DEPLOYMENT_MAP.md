# Deployment Map

This is the authoritative reference for which service hosts which domain and how to deploy each one. Confusing these is the most common source of "I deployed but nothing changed" incidents.

## Domain → Hosting Service

| Domain | Hosting | Stack | Region | How deployed |
|--------|---------|-------|--------|--------------|
| `hashpass.tech` | Source CloudFront + Route53 | Static site from target-account S3 origin | global / us-east-1 | Auto — the target web pipeline publishes the origin; source Route53 aliases the apex to CloudFront |
| `dev.hashpass.tech` | Source CloudFront + Route53 | Static site from target-account S3 origin | global / us-east-1 | Auto — the development pipeline publishes the dev origin; the source front door keeps the hostname HTTPS-only |
| `api.hashpass.tech` | AWS Lambda + API Gateway | Expo Router API routes | **us-east-1** | Auto — target web pipeline deploys `hashpass-prod-expo-router-api` and verifies `/api/config/versions` |
| `api-dev.hashpass.tech` | AWS Lambda + API Gateway | Expo Router API routes | us-east-1 | Auto — target dev web pipeline deploys `hashpass-dev-expo-router-api` and verifies `/api/config/versions` |
| `bsl.hashpass.tech` | Hybrid (cut over 2026-07-29): source-account CloudFront (unchanged, `E2FCDJB1JCS7TW`) fronting a plain target-account S3 bucket. Source-account pipeline deleted. | Static (Expo web export) | us-east-2 | Auto — `bsl-hashpass-prod` pipeline (target account, `bsl-target` stack) on push to `main`, running `build-bsl-static-site.sh` (no SST) |
| `bsl-dev.hashpass.tech` | Hybrid (cut over 2026-07-28): source-account CloudFront (unchanged, `E279RW9PP52TC0`) fronting a plain target-account S3 bucket | Static (Expo web export) | us-east-2 | Auto — `bsl-hashpass-dev` pipeline (target account, `bsl-target` stack) on push to `develop`, running `build-bsl-static-site.sh` (no SST) |
| `hashpass.club` | GitHub Pages | Next.js static | CDN | Auto — `deploy-club-docs.yml` on push to `main` |

## Account split: what's on the source account vs. the target account

Two AWS accounts are in play (see `.agents/active/task-aws-account-migration.md`
for the full, verified audit): the **source account** (`<source-account-id>`, the
original account, still holds DNS/CloudFront/email for all `hashpass.*`
domains) and the **target account** (`<target-account-id>`, the newer account,
holds the actual compute — Lambda, the Android release runner, the S3
origins CloudFront serves). **DNS/hosted zone hosting for `hashpass.tech`,
`hashpass.club`, `hashpass.lat`, and `hashpass.info` stays on the source
account indefinitely by decision (2026-07-28)** — this is not a pending
cutover, it's the intended stable state. `hashpass.club` and `hashpass.info`
also carry live email (MX/DKIM/DMARC) on the source account; `hashpass.info`
specifically is the planned fallback SMTP domain for
`.agents/pending/email-proxy-balancer.md`.

**Two things found live in AWS during that audit but not documented
anywhere in this file before now:**

- **`bitacora.hashpass.tech`** — a CloudFront distribution exists for this
  hostname (source account, SST-placeholder origin, same shape as BSL) but
  nothing in this repo's docs, scripts, or workflows references it. Purpose
  unconfirmed (possibly a changelog/audit-log site — "bitácora" is Spanish
  for "logbook"). Needs identification before anyone can say how to deploy
  or maintain it.
- **Legacy Amplify app `bsl2025.hashpass.tech`** (source account,
  `us-east-2`) — confirmed archival/no longer maintained (2026-07-28); fine
  to leave stale on the source account, no deploy path needed.

## Critical: The front door, API, and BSL deploy paths are independent

The public surface is now split across independent deployment paths:

1. The source-account CloudFront front door serves `hashpass.tech` and `dev.hashpass.tech` and aliases both hostnames to the target-account static origins.
2. The target-account web pipeline publishes the `hashpass.tech` S3 origin and the `dev.hashpass.tech` development origin.
3. The same target web deploy helper packages the Expo Router API, updates the matching Lambda, and fails if the public API version endpoint is stale.
4. Both `bsl.hashpass.tech` and `bsl-dev.hashpass.tech` are served by the same **hybrid** path (target-account CodePipeline + EC2 worker running a plain static build/S3-sync, fronted by the *unchanged* source-account CloudFront distribution) — see below. The source-account SST pipelines that used to serve both are deleted.

These are completely independent. A failure in one does not affect the other. Check the correct dashboard when debugging.

## How to Deploy Each Target

### `hashpass.tech`

The public front door is a source-account CloudFront distribution. If the origin changes, update the target web pipeline and then cut the source alias over to the new distribution:

```bash
# Inspect the source front door
terraform -chdir=packages/infra/terraform/stacks/aws plan -var-file=terraform.dev.tfvars -var='site_origin_domain_name=hashpass-production-site-<target-account-id>-us-east-2.s3-website.us-east-2.amazonaws.com'
```

The target web pipeline publishes the S3 origin that CloudFront serves.

### `dev.hashpass.tech`

The development web surface uses the same front-door pattern as production. The target-account `develop` pipeline publishes the dev S3 origin, and the source-account CloudFront front door keeps the hostname HTTPS-only while the target stack remains the origin of truth.

### `api.hashpass.tech` / `api-dev.hashpass.tech`

The API lives in the target-account Lambda + API Gateway stack, not Amplify. The active web deploy helper packages the API with `packages/tools/scripts/package-lambda.sh`, updates the Lambda code, waits for the update, and verifies the public version endpoint.

Patch releases also run `packages/tools/scripts/deploy-api-lambda.sh` from `infra-deploy.yml` after the SST static deploy attempt. That workflow switches from the source-account infra role to the target-account `AWS_WEB_PIPELINE_ROLE_ARN`, builds a fresh Expo API bundle if needed, and then updates Lambda. It is intentionally redundant with the target web pipeline so a green static deploy cannot hide a stale API Lambda. The BSL SST static deploy is best-effort in this workflow because `bsl.hashpass.tech` also deploys through SST Console; the API Lambda update and public version verification remain hard-failing.

**Lambda names:**
- Production: `hashpass-prod-expo-router-api` (us-east-1)
- Development: `hashpass-dev-expo-router-api` (us-east-1)

**Version guard:**
- Production must return the release version from `https://api.hashpass.tech/api/config/versions`.
- Development must return the release version from `https://api-dev.hashpass.tech/api/config/versions`.
- A deploy that leaves either endpoint stale is failed and must not be reported as complete.

### `bsl.hashpass.tech` / `bsl-dev.hashpass.tech`

**Prod and dev now run genuinely different deploy paths — read carefully before touching either.**

**Original incident (2026-07-25 to 2026-07-28):** both `bsl-hashpass-prod`/`bsl-hashpass-dev` CodePipelines (source account, `<source-account-id>`) had `FullRepositoryId` set to `edcalderon/hashpass.tech` (a personal fork) instead of the org repo. `bsl-hashpass-prod` silently went 3 days / ~14 releases stale (last real trigger 2026-07-25, v1.8.260) because nothing in the release automation ever pushes to that fork's `main` branch — this is what caused `bsl.hashpass.tech` to show `v1.8.273` while `hashpass.tech` was already on `v1.8.274`. Fixed the repo wiring on both source pipelines the same day. Full incident writeup: `.agents/active/task-aws-account-migration.md`.

**`packages/infra/terraform/stacks/bsl-target`** (target account, `<target-account-id>`) provisions a dedicated EC2 build worker (same reusable module `hashpass-web` uses — EC2 instead of CodeBuild because the target account's CodeBuild concurrent-build quota turned out to be `0` for every environment type, pre-existing and account-wide, unrelated to BSL) and two CodePipelines, `bsl-hashpass-prod` and `bsl-hashpass-dev`, both correctly wired to `hashpass-tech/hashpass.tech`.

**Blocker discovered building this out:** the target account still can't create new CloudFront distributions — `AccessDenied: Your account must be verified before you can add new CloudFront resources` (confirmed via a real failed `sst deploy`). This is a normal AWS anti-fraud check for new/low-usage accounts, not specific to us; an AWS Support case was submitted 2026-07-28 requesting verification (framed as an internal business-unit migration, not fraud). `hashpass-web`'s own `enable_cloudfront = true` setting for its target CloudFront has the identical problem — the target account currently has **zero** CloudFront distributions of any kind.

**`bsl-dev.hashpass.tech`: cut over to a hybrid, live since 2026-07-28**, rather than wait on that verification:
- The **existing source-account CloudFront distribution** (`E279RW9PP52TC0`, already-issued ACM cert, no new domain validation needed) keeps serving the domain — untouched, still source-account.
- Its **origin** was repointed from SST's `placeholder.sst.dev` + CloudFront-Function/KV routing to a **plain target-account S3 bucket** (`aws_s3_bucket.bsl_dev_site` in `bsl-target/main.tf`), via a one-time manual `update-distribution` call (this resource predates proper IaC ownership — a real `terraform import` is a documented follow-up, not yet done).
- `bsl-target`'s dev CodePipeline runs `packages/tools/scripts/build-bsl-static-site.sh` — a plain `expo export` + `aws s3 sync`, no SST/Pulumi involved at all, so it never touches the blocked `CreateDistribution` codepath.
- The now-redundant **source-account** `bsl-hashpass-dev` CodePipeline + `bsl-hashpass-dev-build` CodeBuild project were **deleted** the same day — leaving them running risked SST reconciling the distribution back to its own desired state on the next `develop` push, undoing the hybrid.
- Verified live: `https://bsl-dev.hashpass.tech/` serves `server: AmazonS3`, confirmed via `get-distribution` that the origin is genuinely the new bucket.
- **Known gap:** the build script does not invalidate CloudFront (the distribution is in a different account than the worker's credentials, so `deploy-static-site.sh`'s invalidation lookup can't resolve it). HTML/manifest objects get `no-cache` headers, so staleness is bounded but not instant.

**`bsl.hashpass.tech` (prod): cut over 2026-07-29, same shape as dev.** `E2FCDJB1JCS7TW`'s origin was repointed from SST's `placeholder.sst.dev` to the target-account bucket (`bsl-hashpass-bsl-prod-site-<target-account-id>-us-east-2`), `FunctionAssociations` cleared, and verified live (`server: AmazonS3`, matching version). The source-account `bsl-hashpass-prod` CodePipeline + CodeBuild project, plus every other orphaned source-account BSL resource (140GB artifact bucket, both SST-era web-asset buckets, both CloudFront Functions, all three BSL IAM roles), were deleted the same day — the source account now has zero BSL resources of any kind. Full writeup: `.agents/done/task-aws-account-migration.md`. The CloudFront distributions themselves (`E2FCDJB1JCS7TW`, `E279RW9PP52TC0`) deliberately stay on source, same permanent shape as `hashpass.tech`/`dev.hashpass.tech` — migrating them is tracked separately in `.agents/pending/task-bsl-cloudfront-distribution-migration.md`, blocked on AWS Support's target-account CloudFront verification.

**Diagnosing a "slow" BSL build:** the EC2 worker runs jobs **one at a time**, and a cancelled CodePipeline execution does *not* stop the worker's build process — an orphan can block every subsequent job indefinitely while showing a near-idle CPU. If a build looks abnormally long, check CPU utilization first (idle + `InProgress` = hang or queue, not a slow build), then `ps`/`journalctl` on the worker over SSM. A `build_timeout_seconds` guard now exists in the worker module to bound this automatically, but it only takes effect after an instance replacement. See the "EC2 pipeline worker: operational gotchas" section of the migration task for the full writeup and a copy-pasteable debugging recipe.

For a manual one-off SST deploy from a workstation with target-account credentials (prod only — dev no longer uses SST):
```bash
HASHPASS_INFRA_TARGET=bsl pnpm --filter @hashpass/infra run deploy:prod
```

Note: requires an IAM role with Route53, CloudFront, S3, and SSM permissions.

### Manually triggering the GitHub Actions infra-deploy workflow

`infra-deploy.yml` triggers automatically on push to `main`/`develop` when infra or API files change. You can also trigger it manually:

```bash
gh workflow run infra-deploy.yml --repo hashpass-tech/hashpass.tech
```

The IAM role (`hashpass-mobile-release-github-actions`) has the `hashpass-infra-deploy-sst` inline policy covering: SSM, S3, Lambda, CloudFront (create/update/invalidate), Route53 (ListHostedZones, ChangeResourceRecordSets, GetChange), and ACM (certificate management).

## CI/CD GitHub Actions Workflows

| Workflow | Trigger | Does what |
|----------|---------|-----------|
| `mobile-android-release.yml` | Manual (`gh workflow run ... --ref v<VERSION>`) | EC2 → Fastlane → Play Store production or closed testing tracks (`release_status=draft` for the first alpha upload while the Play app is still draft) |
| `secret-scan.yml` | Push to `main`/`develop`, PRs | gitleaks scan of committed files |
| `deploy-club-docs.yml` | Push to `main` | Builds and publishes `hashpass.club` to GitHub Pages |
| `infra-deploy.yml` | Push to `main`/`develop` (infra/api paths) + manual | Best-effort SST static deploy attempt (no longer BSL's live serving path since the hybrid cutover; API Lambda update + version verification remain the hard release gate) |
| `release-infra.yml` | Manual | Version bump + infra deploy |

## Native Android App — dev builds hit api-dev (intentional)

Android CI builds with `--field environment=development` embed `EXPO_PUBLIC_SUPABASE_PROFILE=core-development` into the JS bundle. At runtime, `readBuildEnvironment()` in `lib/api-client.ts` detects `"development"` as a substring and routes all API calls to `api-dev.hashpass.tech`. This is **by design** — the dev build tests against the dev Supabase project AND the dev Lambda together.

| CI field | Supabase profile | API Lambda |
|----------|-----------------|------------|
| `environment=development` | `core-development` | `hashpass-dev-expo-router-api` (us-east-1) |
| `environment=production` | `core-production` | `hashpass-prod-expo-router-api` (us-east-1) |

**Keep the Lambdas in sync:** `hashpass-dev-expo-router-api` is updated through the target-account deploy path. Always merge `main` → `develop` and redeploy after every release so dev builds don't run stale server code.

If you need to fast-sync `api-dev` with `api-prod` without a full build (e.g. after a hotfix):
```bash
aws lambda get-function --function-name hashpass-prod-expo-router-api --region us-east-1 \
  --query 'Code.Location' --output text | xargs curl -s -o /tmp/lambda-prod.zip
aws lambda update-function-code --function-name hashpass-dev-expo-router-api \
  --region us-east-1 --zip-file fileb:///tmp/lambda-prod.zip
```

## Lambda Environment Variables

Both `hashpass-prod-expo-router-api` and `hashpass-dev-expo-router-api` use `hostnameFromRequest()` to select a Supabase profile from the request's `Origin` / `Referer` / `Host` header. See `apps/mobile-app/config/supabase-profiles.ts` for the host→profile mapping:

- `api.hashpass.tech` → `core-production`
- `api-dev.hashpass.tech` → `core-development`

All secrets (Supabase service keys, SMTP credentials, OAuth secrets) are configured directly in each Lambda's environment — not via SST at deploy time. To update Lambda env vars:

```bash
# Production
aws lambda update-function-configuration \
  --function-name hashpass-prod-expo-router-api \
  --region us-east-1 \
  --environment "Variables={KEY=value,...}"

# Development
aws lambda update-function-configuration \
  --function-name hashpass-dev-expo-router-api \
  --region us-east-1 \
  --environment "Variables={KEY=value,...}"
```

Or use the AWS Console → Lambda → select function → Configuration → Environment variables.

## CloudFront Distributions

`hashpass.tech` and `bsl-dev.hashpass.tech` both use a source-account CloudFront distribution that fronts a target-account static origin (S3). Keep DNS and certificate validation changes in the source zone and origin changes in the target stack.

Both `bsl.hashpass.tech` (`E2FCDJB1JCS7TW`) and `bsl-dev.hashpass.tech` (`E279RW9PP52TC0`) are now out of SST's control (dev since 2026-07-28, prod since 2026-07-29) — neither pipeline runs SST anymore, so nothing will overwrite manual changes to either distribution. Both origins are plain S3 website endpoints now, safe to inspect/manage directly (ideally via Terraform import, not yet done — see `.agents/pending/task-bsl-cloudfront-distribution-migration.md`).
