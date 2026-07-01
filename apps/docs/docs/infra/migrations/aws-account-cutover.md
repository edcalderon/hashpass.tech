# HashPass AWS Account Migration Playbook

This playbook documents the migration from AWS account `058264267235` to AWS account `952191196420`.

The rule for every phase is simple:

- build the replacement in the target account first
- verify it in parallel
- do not destroy the source account until the replacement is confirmed healthy
- rollback must be a traffic or configuration flip, not a rebuild

## Why this exists

HashPass currently spans several AWS delivery paths:

- `hashpass.tech` and `api.hashpass.tech` are still Amplify-backed in the source account
- `bsl.hashpass.tech` and `bsl-dev.hashpass.tech` use CodeBuild and CodePipeline in the source account
- the Android build runner lives on EC2 in the source account
- the public `hashpass.tech` hosted zone also lives in the source account
- the new account now has the target hosted zones, static site stack, BSL pipeline, API backend, and Android runner in place, but the public registrar delegation still points at the source account

The new account started empty for these surfaces, which made it suitable for a clean IaC rollout and a low-risk rollback posture. It is now populated in parallel with the source account so we can validate before any registrar flip.

## Migration goals

1. Remove Amplify from the new account.
2. Host `hashpass.tech` through IaC-managed static hosting in the new account.
3. Recreate the BSL pipelines in the new account.
4. Recreate the Android EC2 runner in the new account.
5. Keep the source account live until the target stack is fully validated.

## Current source-account inventory

The source account currently contains these relevant resources:

- Amplify app `dy8duury54wam` for `hashpass.tech`
- Lambda functions `hashpass-api-dev` and `hashpass-api-prod`
- CodeBuild projects `bsl-hashpass-dev-build` and `bsl-hashpass-prod-build`
- CodePipeline pipelines `bsl-hashpass-dev` and `bsl-hashpass-prod`
- EC2 runner `hashpass-mobile-release-1`
- Route53 hosted zone `hashpass.tech`

The hosted zone also carries DNS for `api.hashpass.tech`, `api-dev.hashpass.tech`, `bsl.hashpass.tech`, `bsl-dev.hashpass.tech`, `www.hashpass.tech`, and several legacy or auxiliary records.

## Reversible rollout model

### Phase 1: Stand up the target account

- Use IaC only.
- Create the target IAM roles, hosted zones, S3 buckets, CloudFront distribution, build worker, and runner resources.
- If CloudFront is unavailable in the new account, use the S3 website fallback first and keep the CloudFront toggle off until AWS verifies the account.
- The first web surface lands in `packages/infra/terraform/stacks/hashpass-web` and deploys through the shared EC2 worker plus `packages/tools/scripts/build-static-site.sh` and `packages/tools/scripts/deploy-static-site.sh`.
- That stack now provisions both the production `main` pipeline and the development `develop` pipeline in the target account.
- The target DNS stack now also creates a dedicated `dev.hashpass.tech` hosted zone so the development site can be isolated from the apex cutover.
- The DNS landing zone lives in `packages/infra/terraform/stacks/hashpass-dns`.
- The API backend lives in `packages/infra/terraform/stacks/hashpass-api-target` and starts with `enable_custom_domain = false` until the new nameservers are delegated.
- Use `pnpm run infra:hashpass-web:plan` and `pnpm run infra:hashpass-web:apply` once the CodeConnections handshake is complete and the target-account `terraform.tfvars` is populated.
- Keep the source account untouched.
- Validate the new stack using the S3 website endpoint or a temporary parallel hostname before any DNS cutover.

### Phase 2: Mirror the web surface

- Deploy the `hashpass.tech` static site in the target account.
- Confirm the production build succeeds from the same monorepo revision.
- Verify the site loads, routes resolve, and the auth callbacks still work.
- Do not remove Amplify yet.
- Use the emitted CloudFront domain for validation when CloudFront is enabled; otherwise use the S3 website endpoint until the account is verified.

### Phase 3: Mirror BSL

- Recreate the BSL CodeBuild and CodePipeline resources in the target account.
- Verify both `dev` and `production` builds against the target account.
- Keep the source pipelines active until the target pipelines are healthy.

### Phase 4: Recreate the Android runner

- Provision the EC2 runner stack with Terraform in the target account.
- Register the runner and validate a full Android build.
- Keep the source runner available until the target runner has proven stable.

### Phase 5: DNS cutover

- The `hashpass.tech`, `hashpass.lat`, and `hashpass.club` hosted zones now exist in the target account.
- Compare records before updating any registrar or alias data.
- Switch traffic only after the target website, API, and runner paths are validated.

## Rollback procedure

Rollback should be a traffic flip, not a rebuild.

1. Restore the DNS target back to the source account.
2. Keep the target stack deployed for debugging.
3. Leave the source Amplify app, pipelines, and runner intact.
4. Re-test the source stack.
5. Only destroy the target stack after the source has been confirmed healthy again.

## Validation checklist

- `hashpass.tech` loads from the target account without Amplify.
- `api.hashpass.tech` responds from the expected backend.
- BSL dev and production builds complete in the target account.
- The Android runner can start, build, and upload without manual console intervention.
- DNS records in the target hosted zone match the source zone before cutover.
- Rollback to the source account is a documented and tested path.

## Operator notes

- Use the target AWS credentials from the repository root `.env` when operating against account `952191196420`.
- Use `TARGET_AWS_ACCOUNT_ID` when you need scripts to assert the destination account explicitly.
- Build the target static site with `pnpm run deploy:web:s3` for a local dry run, or let the new EC2 worker perform the same build and S3 sync inside AWS.
- Use `.github/workflows/hashpass-web-pipeline-monitor.yml` for day-to-day control of the web worker. Set `AWS_WEB_PIPELINE_ROLE_ARN` from the Terraform output and dispatch the workflow with `mode=monitor` or `mode=stop` instead of using ad hoc target-account AWS CLI calls, unless you are debugging a failure.
- If the GitHub repo variable is missing during bootstrap, pass the same role ARN through the manual `aws_web_pipeline_role_arn` workflow dispatch input and then save it as the repo variable after the first successful run.
- If CloudFront is unavailable in the target account, keep `enable_cloudfront = false` in the stack tfvars and validate against the S3 website endpoint first.
- Keep source-account credentials and resources available until the migration has been stable long enough to close the rollback window.
