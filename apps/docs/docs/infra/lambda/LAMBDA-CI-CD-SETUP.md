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

## Persistent Worker Cost Guard

Persistent EC2 build workers are disabled by default in both the `hashpass-web`
and `bsl-target` stacks. They can only be provisioned when all of the following
are explicitly set in the environment's untracked `terraform.tfvars`:

- a non-zero worker count;
- `enable_pipeline_build_workers = true`;
- `pipeline_build_worker_approval_reference` with a review, incident, or
  change reference.

The approval reference is recorded as an EC2 tag. Revert the enablement after
the approved work finishes. The GitHub pipeline monitor also defaults to
stop-only: it will not start a stopped worker unless the repository variable
`WEB_PIPELINE_WORKER_AUTOSTART_ENABLED` is deliberately set to `true`.

The same scheduled workflow performs independent idle-stop sweeps for the
HashPass web workers and the BSL dev/prod workers every ten minutes. Each group
is stopped only when its own CodePipeline executions are idle; activity in one
group must not keep the other group's instances running. The BSL sweep does not
run on a source push, because CodePipeline can take a short time to register a
new execution after that push; use the scheduled sweep or an explicit `stop`
workflow dispatch instead.

For an EC2-backed pipeline, enable `WEB_PIPELINE_WORKER_AUTOSTART_ENABLED` or
`BSL_PIPELINE_WORKER_AUTOSTART_ENABLED` only after the corresponding worker has
an approved provisioning reference. On a push, the monitor starts only the
worker for that branch (`develop` → dev, `main` → production), waits for that
single pipeline, and stops it when it becomes idle. It never starts the other
environment merely because a build was triggered.

BSL development now defaults to the existing Ohio CodeBuild project
`bsl-hashpass-dev-build`; set `development_build_execution_mode = "ec2"` only
for a reviewed rollback. Validate a dev CodeBuild execution before switching
the production action. The production migration remains intentionally separate
until that validation succeeds.

HashPass web migration is staged the same way. `hashpass-web` defaults its
development pipeline to an on-demand CodeBuild project named
`hashpass-dev-site-build`, while production remains on the custom action until
the development release has passed build, deploy, API-version, and smoke-test
checks. The CodeBuild project runs
`packages/tools/buildspecs/hashpass-static-site.yml`, which calls the existing
build and deploy helpers and uses a least-privilege role for the configured S3,
CloudFront invalidation, and Lambda targets. Set
`development_build_execution_mode = "custom"` for an explicit rollback; set
`production_build_execution_mode = "codebuild"` only as the separately reviewed
production cutover.

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
