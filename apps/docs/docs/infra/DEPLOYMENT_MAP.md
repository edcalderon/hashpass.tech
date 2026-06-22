# Deployment Map

This is the authoritative reference for which service hosts which domain and how to deploy each one. Confusing these is the most common source of "I deployed but nothing changed" incidents.

## Domain → Hosting Service

| Domain | Hosting | Stack | Region |
|--------|---------|-------|--------|
| `hashpass.tech` | AWS Amplify | Static (Expo web export) | us-east-2 |
| `bsl.hashpass.tech` | SST StaticSite + CloudFront | Static (Expo web export) | us-east-2 |
| `bsl-dev.hashpass.tech` | SST StaticSite + CloudFront | Static (Expo web export) | us-east-2 |
| `api.hashpass.tech` | AWS Lambda (SST) | Expo Router API routes | us-east-2 |
| `api-dev.hashpass.tech` | AWS Lambda (SST) | Expo Router API routes | us-east-2 |
| `bsl2025.hashpass.tech` | AWS Amplify | Static | us-east-2 |
| `bitacora.hashpass.tech` | SST StaticSite + CloudFront | Static | us-east-2 |

## Critical: `hashpass.tech` is NOT deployed by SST

**This is the most important thing to know.**

`hashpass.tech` runs on **AWS Amplify**, completely independent of SST. When you run `pnpm --filter @hashpass/infra run deploy:prod`, it updates `bsl.hashpass.tech` and `api.hashpass.tech` — it does **not** touch `hashpass.tech`.

`bsl.hashpass.tech` and `hashpass.tech` run identical code from the same monorepo, but are hosted on different services. Changes to the shared code only go live on `hashpass.tech` after Amplify redeploys.

## How to Deploy Each Target

### `hashpass.tech` (Amplify)

Amplify watches the `main` branch of the GitHub repo and should auto-build on push. If it doesn't trigger automatically, start a manual deploy:

```bash
aws amplify start-job \
  --app-id <AMPLIFY_APP_ID_PROD> \
  --region us-east-2 \
  --branch-name main \
  --job-type RELEASE
```

Check the Amplify console or poll the job:
```bash
aws amplify get-job \
  --app-id <AMPLIFY_APP_ID_PROD> \
  --region us-east-2 \
  --branch-name main \
  --job-id <JOB_ID> \
  --query 'job.summary.status' --output text
```

The app ID is stored in AWS Amplify (us-east-2). Do not hardcode it in scripts — read it from Amplify or a local `.env` that is gitignored.

### `bsl.hashpass.tech` + `api.hashpass.tech` (SST)

```bash
HASHPASS_INFRA_TARGET=bsl pnpm --filter @hashpass/infra run deploy:prod
```

This triggers a Metro build of the web app and deploys both the static site and all Expo Router API Lambda functions.

### `bsl-dev.hashpass.tech` + `api-dev.hashpass.tech` (SST)

```bash
HASHPASS_INFRA_TARGET=bsl pnpm --filter @hashpass/infra run deploy:dev
```

## CI/CD via GitHub Actions

The `infra-deploy.yml` workflow triggers on push to `main` (when files under `apps/mobile-app/**` or `packages/**` change). It runs the SST deploy, which covers `bsl.hashpass.tech` and `api.hashpass.tech`.

For `hashpass.tech`, Amplify has its own webhook connection to the repo and builds independently.

### CI IAM Requirements

The GitHub Actions IAM role needs these permissions for the SST deploy step to succeed:
- `ssm:GetParameter` / `ssm:PutParameter` / `ssm:DeleteParameter` on the SST parameter path
- `amplify:StartJob` / `amplify:GetJob` on the Amplify app (for manual trigger steps if added)

See the IAM role in AWS Console for the current policy state.

## Lambda Environment

The Expo Router API routes run inside a single Lambda function. Environment variables are configured directly on the Lambda (not via SST at deploy time for secrets). All Supabase service role keys, email credentials, and OAuth secrets must be present in the Lambda's environment configuration.

The Lambda uses `hostnameFromRequest()` to select a Supabase profile based on the request's `Origin` / `Referer` / `Host` header. See `apps/mobile-app/config/supabase-profiles.ts` for the full host→profile mapping.

## CloudFront Distributions

SST manages CloudFront distributions automatically. Do not manually edit SST-created distributions — SST will overwrite changes on the next deploy.

Two distributions that previously existed as SST placeholders with no aliases were deleted in June 2026 (they were abandoned stale stacks, not serving any traffic).
