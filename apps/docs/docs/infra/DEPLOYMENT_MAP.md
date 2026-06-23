# Deployment Map

This is the authoritative reference for which service hosts which domain and how to deploy each one. Confusing these is the most common source of "I deployed but nothing changed" incidents.

## Domain → Hosting Service

| Domain | Hosting | Stack | Region | How deployed |
|--------|---------|-------|--------|--------------|
| `hashpass.tech` | AWS Amplify | Static (Expo web export) | us-east-2 | Auto — Amplify webhook on push to `main` |
| `api.hashpass.tech` | AWS Lambda + API Gateway | Expo Router API routes | **us-east-1** | Auto — Amplify postBuild step (same build as above) |
| `api-dev.hashpass.tech` | AWS Lambda + API Gateway | Expo Router API routes | us-east-1 | Auto — Amplify postBuild step on push to `develop` |
| `bsl.hashpass.tech` | SST StaticSite (S3 + CloudFront) | Static (Expo web export) | us-east-2 | Auto — SST Console autodeploy on push to `main` |
| `bsl-dev.hashpass.tech` | SST StaticSite (S3 + CloudFront) | Static (Expo web export) | us-east-2 | Auto — SST Console autodeploy on push to `develop` |
| `hashpass.club` | GitHub Pages | Next.js static | CDN | Auto — `deploy-club-docs.yml` on push to `main` |

## Critical: Two separate auto-deploy systems run in parallel

On every push to `main`, **two independent systems** both deploy from the same commit:

1. **AWS Amplify** (`amplify.yml`) — deploys `hashpass.tech` + Lambda `hashpass-api-prod` (us-east-1)
2. **SST Console autodeploy** (`sst.config.ts` → `console.autodeploy`) — deploys `bsl.hashpass.tech` (us-east-2)

These are completely independent. A failure in one does not affect the other. Check the correct dashboard when debugging.

## api.hashpass.tech is NOT managed by SST — it is deployed by Amplify

**This is the most commonly confused fact.**

`api.hashpass.tech` runs on a Lambda function (`hashpass-api-prod`, us-east-1) that is packaged and deployed by the **Amplify postBuild step** in `amplify.yml`, not by SST or any GitHub Actions workflow.

The deploy command in `amplify.yml` postBuild:
```bash
aws lambda update-function-code \
  --function-name hashpass-api-prod \
  --region us-east-1 \
  --zip-file fileb://lambda-deployment.zip
```

The Lambda package is built by `packages/tools/scripts/package-lambda.sh`, which bundles the Expo API routes from `dist/server/` into a zip using the handler at `packages/infra/lambda/index.js`.

## How to Deploy Each Target

### `hashpass.tech` + `api.hashpass.tech` (Amplify)

Amplify watches `main` and `develop` branches and auto-builds on push. If a build doesn't trigger, start it manually:

```bash
# Check recent builds
aws amplify list-jobs --app-id dy8duury54wam --region us-east-2 --branch-name main \
  --query 'jobSummaries[0:5].{id:jobId,status:status,commit:commitId}' --output table

# Trigger a manual build
aws amplify start-job --app-id dy8duury54wam --region us-east-2 \
  --branch-name main --job-type RELEASE
```

A successful Amplify build deploys BOTH `hashpass.tech` AND the Lambda (`api.hashpass.tech`).

**Lambda names:**
- Production (`main` branch): `hashpass-api-prod` (us-east-1)
- Development (`develop` branch): `hashpass-api-dev` (us-east-1)

### `bsl.hashpass.tech` (SST)

SST Console autodeploy handles this on every push to `main`. No manual action required.

For a manual one-off deploy:
```bash
HASHPASS_INFRA_TARGET=bsl pnpm --filter @hashpass/infra run deploy:prod
```

Note: requires an IAM role with Route53, CloudFront, S3, and SSM permissions. The current `hashpass-mobile-release-github-actions` role does NOT have these — use the infra role instead.

### Manually triggering the GitHub Actions infra-deploy workflow

`infra-deploy.yml` is now **manual-only** (push trigger was removed in v1.8.91). Run it when you need a one-off SST deploy from CI:

```bash
gh workflow run infra-deploy.yml --repo hashpass-tech/hashpass.tech
```

## CI/CD GitHub Actions Workflows

| Workflow | Trigger | Does what |
|----------|---------|-----------|
| `mobile-android-release.yml` | Manual (`gh workflow run ... --ref v<VERSION>`) | EC2 → Fastlane → Play Store |
| `secret-scan.yml` | Push to `main`/`develop`, PRs | gitleaks scan of committed files |
| `deploy-club-docs.yml` | Push to `main` | Builds and publishes `hashpass.club` to GitHub Pages |
| `infra-deploy.yml` | **Manual only** | One-off SST deploy for `bsl.hashpass.tech` |
| `release-infra.yml` | Manual | Version bump + infra deploy |

## Lambda Environment Variables

The Lambda (`hashpass-api-prod`) uses `hostnameFromRequest()` to select a Supabase profile based on the request's `Origin` / `Referer` / `Host` header. See `apps/mobile-app/config/supabase-profiles.ts` for the host→profile mapping.

All secrets (Supabase service keys, SMTP credentials, OAuth secrets) are configured directly in the Lambda environment — not via SST at deploy time. To update Lambda env vars:

```bash
aws lambda update-function-configuration \
  --function-name hashpass-api-prod \
  --region us-east-1 \
  --environment "Variables={KEY=value,...}"
```

Or use the AWS Console → Lambda → hashpass-api-prod → Configuration → Environment variables.

## CloudFront Distributions

SST manages the `bsl.hashpass.tech` CloudFront distribution automatically. Do not manually edit SST-created distributions — SST will overwrite changes on the next deploy.

`hashpass.tech` uses Amplify's built-in CDN (also CloudFront-backed, managed by Amplify).
