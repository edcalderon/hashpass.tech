# Lambda Deployment Quick Start

The active HASHPASS API deploy path is the target-account web pipeline. It is not Amplify and it is not the old standalone `deploy-lambda.yml` workflow.

## Current Flow

1. `main` or `develop` triggers the target web pipeline.
2. The worker runs `packages/tools/scripts/build-static-site.sh`.
3. The worker runs `packages/tools/scripts/deploy-static-site.sh`.
4. The deploy helper syncs the static site to S3 and invalidates CloudFront when configured.
5. The deploy helper runs `packages/tools/scripts/package-lambda.sh`.
6. The deploy helper updates the configured Expo Router API Lambda.
7. The deploy helper verifies `/api/config/versions` against `package.json`.

If the API version endpoint is stale, the deploy fails.

## Lambda Names

| Environment | Branch | Function | Version check |
|-------------|--------|----------|---------------|
| Production | `main` | `hashpass-prod-expo-router-api` | `https://api.hashpass.tech/api/config/versions` |
| Development | `develop` | `hashpass-dev-expo-router-api` | `https://api-dev.hashpass.tech/api/config/versions` |

## Manual Emergency Deploy

Use this only for break-glass recovery. Normal releases should go through `npm run release:promote`, PR merge, and the target web pipeline.

```bash
./packages/tools/scripts/package-lambda.sh

aws lambda update-function-code \
  --function-name hashpass-prod-expo-router-api \
  --region us-east-1 \
  --zip-file fileb://lambda-deployment.zip

curl -fsS https://api.hashpass.tech/api/config/versions
```

For development:

```bash
aws lambda update-function-code \
  --function-name hashpass-dev-expo-router-api \
  --region us-east-1 \
  --zip-file fileb://lambda-deployment.zip

curl -fsS https://api-dev.hashpass.tech/api/config/versions
```

## Environment Variables

Static deploys update Lambda code only. They do not rotate Supabase keys, OAuth secrets, SMTP credentials, or database URLs.

When secrets change, update Lambda configuration before release:

```bash
node packages/tools/scripts/sync-env.js production --tenant core
node packages/tools/scripts/sync-env.js dev --tenant core
```

If the sync script cannot access the target AWS account, update the environment in the AWS Lambda console and then verify auth endpoints before promoting the release.

## Archived Material

Older Amplify and standalone Lambda CI/CD instructions are historical only. Use this page, `apps/docs/docs/infra/DEPLOYMENT_MAP.md`, and `apps/docs/docs/reference/release/RELEASE_WORKFLOW.md` for active operations.
