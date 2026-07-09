# Deployment Map

This is the authoritative reference for which service hosts which domain and how to deploy each one. Confusing these is the most common source of "I deployed but nothing changed" incidents.

## Domain → Hosting Service

| Domain | Hosting | Stack | Region | How deployed |
|--------|---------|-------|--------|--------------|
| `hashpass.tech` | Source CloudFront + Route53 | Static site from target-account S3 origin | global / us-east-1 | Auto — the target web pipeline publishes the origin; source Route53 aliases the apex to CloudFront |
| `dev.hashpass.tech` | Source CloudFront + Route53 | Static site from target-account S3 origin | global / us-east-1 | Auto — the development pipeline publishes the dev origin; the source front door keeps the hostname HTTPS-only |
| `api.hashpass.tech` | AWS Lambda + API Gateway | Expo Router API routes | **us-east-1** | Auto — target web pipeline deploys `hashpass-prod-expo-router-api` and verifies `/api/config/versions` |
| `api-dev.hashpass.tech` | AWS Lambda + API Gateway | Expo Router API routes | us-east-1 | Auto — target dev web pipeline deploys `hashpass-dev-expo-router-api` and verifies `/api/config/versions` |
| `bsl.hashpass.tech` | SST StaticSite (S3 + CloudFront) | Static (Expo web export) | us-east-2 | Auto — SST Console autodeploy on push to `main` |
| `bsl-dev.hashpass.tech` | SST StaticSite (S3 + CloudFront) | Static (Expo web export) | us-east-2 | Auto — SST Console autodeploy on push to `develop` |
| `hashpass.club` | GitHub Pages | Next.js static | CDN | Auto — `deploy-club-docs.yml` on push to `main` |

## Critical: The front door, API, and BSL deploy paths are independent

The public surface is now split across independent deployment paths:

1. The source-account CloudFront front door serves `hashpass.tech` and `dev.hashpass.tech` and aliases both hostnames to the target-account static origins.
2. The target-account web pipeline publishes the `hashpass.tech` S3 origin and the `dev.hashpass.tech` development origin.
3. The same target web deploy helper packages the Expo Router API, updates the matching Lambda, and fails if the public API version endpoint is stale.
4. The SST Console autodeploy path still serves `bsl.hashpass.tech` (us-east-2).

These are completely independent. A failure in one does not affect the other. Check the correct dashboard when debugging.

## How to Deploy Each Target

### `hashpass.tech`

The public front door is a source-account CloudFront distribution. If the origin changes, update the target web pipeline and then cut the source alias over to the new distribution:

```bash
# Inspect the source front door
terraform -chdir=packages/infra/terraform/stacks/aws plan -var-file=terraform.dev.tfvars -var='site_origin_domain_name=hashpass-production-site-952191196420-us-east-2.s3-website.us-east-2.amazonaws.com'
```

The target web pipeline publishes the S3 origin that CloudFront serves.

### `dev.hashpass.tech`

The development web surface uses the same front-door pattern as production. The target-account `develop` pipeline publishes the dev S3 origin, and the source-account CloudFront front door keeps the hostname HTTPS-only while the target stack remains the origin of truth.

### `api.hashpass.tech` / `api-dev.hashpass.tech`

The API lives in the target-account Lambda + API Gateway stack, not Amplify. The active web deploy helper packages the API with `packages/tools/scripts/package-lambda.sh`, updates the Lambda code, waits for the update, and verifies the public version endpoint.

Patch releases also run `packages/tools/scripts/deploy-api-lambda.sh` from `infra-deploy.yml` after the SST static deploy. That workflow switches from the source-account infra role to the target-account `AWS_WEB_PIPELINE_ROLE_ARN` before updating Lambda. It is intentionally redundant with the target web pipeline so a green static deploy cannot hide a stale API Lambda.

**Lambda names:**
- Production: `hashpass-prod-expo-router-api` (us-east-1)
- Development: `hashpass-dev-expo-router-api` (us-east-1)

**Version guard:**
- Production must return the release version from `https://api.hashpass.tech/api/config/versions`.
- Development must return the release version from `https://api-dev.hashpass.tech/api/config/versions`.
- A deploy that leaves either endpoint stale is failed and must not be reported as complete.

### `bsl.hashpass.tech` (SST)

SST Console autodeploy handles this on every push to `main`. No manual action required.

For a manual one-off deploy:
```bash
HASHPASS_INFRA_TARGET=bsl pnpm --filter @hashpass/infra run deploy:prod
```

Note: requires an IAM role with Route53, CloudFront, S3, and SSM permissions. The current `hashpass-mobile-release-github-actions` role does NOT have these — use the infra role instead.

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
| `infra-deploy.yml` | Push to `main`/`develop` (infra/api paths) + manual | SST deploy for `bsl.hashpass.tech` |
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

SST manages the `bsl.hashpass.tech` CloudFront distribution automatically. Do not manually edit SST-created distributions — SST will overwrite changes on the next deploy.

`hashpass.tech` uses a source-account CloudFront distribution that fronts the target-account static origin. Keep DNS and certificate validation changes in the source zone and origin changes in the target web stack.
