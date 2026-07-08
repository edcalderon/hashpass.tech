# Lambda CI/CD Setup

The old Amplify and standalone `deploy-lambda.yml` setup paths are retired. The active setup is part of the target-account `hashpass-web` Terraform stack.

## Active Stack

Use `packages/infra/terraform/stacks/hashpass-web`.

Relevant variables:

- `lambda_region`: defaults to `us-east-1`
- `lambda_function_name`: defaults to `hashpass-prod-expo-router-api`
- `dev_lambda_function_name`: defaults to `hashpass-dev-expo-router-api`
- `api_version_url`: defaults to `https://api.hashpass.tech/api/config/versions`
- `dev_api_version_url`: defaults to `https://api-dev.hashpass.tech/api/config/versions`

The stack passes these values into the EC2 build worker as:

- `SITE_LAMBDA_FUNCTION_NAME`
- `SITE_LAMBDA_REGION`
- `SITE_API_VERSION_URL`

## Worker Permissions

The `aws_pipeline_ec2_worker` module grants the build worker permission to:

- read the configured Lambda functions
- update Lambda code
- wait for the Lambda update to complete

Do not give the worker broad Lambda permissions. Add function names to the Terraform variables instead.

## Deployment Contract

The target web deploy helper must:

1. build the static web app
2. publish the static assets
3. package the Expo Router API
4. update the environment-specific Lambda
5. verify the public API version endpoint

If the version endpoint is stale, the deploy fails and the release is not complete.

## Environment Updates

Lambda code deploys do not update secrets. Use the environment sync path when keys or URLs change:

```bash
node packages/tools/scripts/sync-env.js production --tenant core
node packages/tools/scripts/sync-env.js dev --tenant core
```

If local credentials cannot assume the target account role, update the Lambda environment in AWS Console and verify:

```bash
curl -fsS https://api.hashpass.tech/api/config/versions
curl -fsS https://api-dev.hashpass.tech/api/config/versions
```

## Historical References

Amplify-era helpers live under `archive/amplify/`. Treat them as migration history only, not as current release instructions.
