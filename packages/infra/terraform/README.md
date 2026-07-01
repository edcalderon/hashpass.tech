# HashPass Multi-Cloud IaC (AWS + GCP)

This Terraform setup deploys the production naming convention discussed for HashPass:

- Frontend (Amplify):
  - `blockchainsummit.hashpass.lat`
  - `blockchainsummit-dev.hashpass.lat`
- Frontend (S3 + CloudFront):
  - `hashpass.tech` target-account static site pipeline
- API (AWS Lambda + API Gateway):
  - `api.hashpass.tech`
  - `api-dev.hashpass.tech`
- DNS (Route 53):
  - `hashpass.tech`
  - `hashpass.lat`
  - `hashpass.club`
- Directus (GCP):
  - `sso.hashpass.co`
  - `sso-dev.hashpass.co`

## Structure

- `stacks/aws`: AWS API + optional Amplify domain association + GitHub Pages DNS for `hashpass.club`
- `stacks/gcp`: GCP Directus VM(s) + optional Cloud DNS records
- `stacks/hashpass-dns`: target-account Route 53 hosted zones for the migration cutover
- `stacks/hashpass-api-target`: target-account API Gateway + Lambda stack for `api.hashpass.tech`
- `stacks/hashpass-web`: target-account CodePipeline + EC2 worker stack for `hashpass.tech`
- `stacks/mobile-release`: AWS EC2 self-hosted GitHub Actions runner for mobile Android builds
- `stacks/mobile-release-target`: isolated target-account Android runner stack used during migration
- `modules/aws_expo_router_api`: reusable Lambda + HTTP API + custom domain module
- `modules/aws_amplify_domain`: reusable Amplify custom domain binding module
- `modules/aws_static_site_pipeline`: reusable S3 + CloudFront + CodePipeline site module with a custom EC2 build action
- `modules/gcp_directus_instance`: reusable Directus compute module
- `modules/aws_github_actions_runner`: reusable EC2 GitHub Actions runner module

## Prerequisites

1. Terraform `>= 1.5`
2. AWS credentials configured (for Route53, ACM, API Gateway, Lambda, Amplify)
3. GCP credentials configured (ADC or `GOOGLE_APPLICATION_CREDENTIALS`)
4. Lambda package built at the configured path:
   - Example: `./packages/tools/scripts/package-lambda.sh`
5. GCP Secret Manager secrets created:
   - `directus-env-dev`
   - `directus-env-prod`
   - each secret must contain the full Directus `.env` content for that environment

If your GCP account cannot manage Secret Manager, use `directus_env_file_paths` in `stacks/gcp/terraform.tfvars` instead.
If your startup Git ref does not contain the compose path, use `directus_compose_file_paths` to inject `docker-compose.yml` directly.
Never commit filled `.env` files to git; keep only `.example` templates in VCS.

## Quick Start

### AWS Stack

```bash
cd packages/infra/terraform/stacks/aws
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Shortcut:

```bash
./packages/infra/terraform/scripts/stack.sh aws plan
./packages/infra/terraform/scripts/stack.sh aws apply
```

Outputs include:

- API base URLs for frontend env vars
- Lambda names
- domain association metadata if Amplify association is enabled

### HashPass Web Stack

This stack provisions the target-account replacement for the `hashpass.tech`
Amplify site. It creates both the production and development pipelines in the
same Terraform state. It creates:

- an S3 bucket for the built site
- a CloudFront distribution with the S3 bucket as origin when the account is verified for CloudFront
- an S3 website fallback when CloudFront is disabled
- a dedicated EC2 build worker that polls a custom CodePipeline build action and runs the shared build/deploy helpers
- a CodePipeline that pulls from GitHub and triggers the EC2 worker
- a matching development pipeline that builds from `develop` with the dev Supabase inputs
- a `dev.hashpass.tech` hosted zone and alias record when the DNS stack is present

Before the first apply, create the CodeConnections connection in the target
account and complete the GitHub handshake:

```bash
TARGET_AWS_ACCOUNT_ID=952191196420 \
AWS_REGION=us-east-2 \
./packages/tools/scripts/provision-infra-connection.sh
```

Then populate `packages/infra/terraform/stacks/hashpass-web/terraform.tfvars`
from the root `.env` values for:

- `supabase_url`
- `supabase_key`
- `google_client_id`
- `supabase_url_dev`
- `supabase_key_dev`
- `dev_route53_zone_name` if you want to override the `dev.hashpass.tech` zone name

Apply it with:

```bash
./packages/infra/terraform/scripts/stack.sh hashpass-web plan
./packages/infra/terraform/scripts/stack.sh hashpass-web apply
```

The initial rollout keeps Amplify alive in the source account. If the target
AWS account cannot create CloudFront yet, leave `enable_cloudfront = false`
and `dev_enable_cloudfront = false`, then validate against the S3 website
endpoint first. Once AWS verifies the account, you can flip CloudFront back on
and reapply without touching the source account. The worker runs the same
`packages/tools/scripts/build-static-site.sh` and
`packages/tools/scripts/deploy-static-site.sh` helpers that local testing uses,
so the target path stays close to the old Amplify build flow without depending
on CodeBuild. If a source archive ever omits the build helper, the worker falls
back to an inline static-site build so the pipeline can still complete.
The EC2 worker role also gets bucket-level S3 permissions only for the deploy
buckets passed in by the stack, which is required for `aws s3 sync --delete`
and the HTML cache refresh `aws s3 cp` calls.
If you enable `enable_github_actions_worker_control = true`, the stack also
creates a least-privilege GitHub Actions role that can read CodePipeline state
and start/stop the shared EC2 worker by instance ID. Copy the
`github_actions_role_arn` output into the GitHub variable
`AWS_WEB_PIPELINE_ROLE_ARN`, then use the monitor workflow in
`.github/workflows/hashpass-web-pipeline-monitor.yml` to keep the worker off
when both the dev and production pipelines are idle.
That workflow is the normal control plane for the worker lifecycle. Use
GitHub Actions to start, monitor, or stop the EC2 instance by tag, and keep
direct target-account AWS CLI usage for bootstrap or emergency debugging only.

```bash
gh workflow run hashpass-web-pipeline-monitor.yml -f mode=monitor
gh workflow run hashpass-web-pipeline-monitor.yml -f mode=stop
```

### HashPass DNS Stack

This stack creates the target-account hosted zones for the migration. It does
not delegate the registrar by itself, so it is safe to apply before DNS
cutover.

```bash
cd packages/infra/terraform/stacks/hashpass-dns
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Shortcut:

```bash
./packages/infra/terraform/scripts/stack.sh hashpass-dns plan
./packages/infra/terraform/scripts/stack.sh hashpass-dns apply
```

Outputs include:

- hosted zone IDs for `hashpass.tech`, `dev.hashpass.tech`, `hashpass.lat`, and `hashpass.club`
- nameserver sets for later registrar delegation

### HashPass API Stack

This stack provisions the target-account Lambda + API Gateway pair for
`api.hashpass.tech` and `api-dev.hashpass.tech`.

```bash
cd packages/infra/terraform/stacks/hashpass-api-target
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Shortcut:

```bash
./packages/infra/terraform/scripts/stack.sh hashpass-api-target plan
./packages/infra/terraform/scripts/stack.sh hashpass-api-target apply
```

Start with `enable_custom_domain = false` while the target zone is still
undelegated. That keeps the backend deployable and lets you verify it through
the `execute-api` URL. After registrar cutover, flip the flag back to `true`
and reapply to create the ACM validation records and public custom domains.

### GCP Stack

```bash
cd packages/infra/terraform/stacks/gcp
cp terraform.tfvars.example terraform.tfvars
cp directus.dev.env.example directus.dev.env
# create directus.prod.env the same way if you deploy prod from this stack
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Shortcut:

```bash
./packages/infra/terraform/scripts/stack.sh gcp plan
./packages/infra/terraform/scripts/stack.sh gcp apply
```

Outputs include:

- Directus instance names
- static IPs
- SSH commands

### Mobile Release Runner Stack

```bash
cd packages/infra/terraform/stacks/mobile-release
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Shortcut:

```bash
./packages/infra/terraform/scripts/stack.sh mobile-release plan
./packages/infra/terraform/scripts/stack.sh mobile-release apply
```

The target-account runner stack uses a separate Terraform state so it can be
provisioned in parallel during the migration:

```bash
./packages/infra/terraform/scripts/stack.sh mobile-release-target plan
./packages/infra/terraform/scripts/stack.sh mobile-release-target apply
```

Outputs include:

- GitHub runner token secret ARN
- EC2 instance IDs and IPs
- VPC and subnet IDs when the stack creates the network for you
- CloudWatch dashboard URL
- CPU and status-check alarm names

If your AWS account has no default VPC, the stack will create a small managed VPC with public subnets automatically. That keeps the runner stack self-contained for repeatable tests.

After `apply`, populate the runner secret with a GitHub PAT that can mint repository runner registration tokens:

```bash
TOKEN="$(gh auth token)"
aws secretsmanager put-secret-value \
  --secret-id "$(terraform output -raw github_runner_token_secret_arn)" \
  --secret-string "${TOKEN}"
```

Keep the PAT scoped to the `hashpass-tech/hashpass.tech` repository and only the permissions needed to create runner registration and removal tokens.

## Suggested Deploy Order

1. Deploy `stacks/gcp` (get static IPs for Directus)
2. Deploy `stacks/hashpass-dns` in the target AWS account to create the hosted zones and nameservers
3. Deploy `stacks/hashpass-api-target` in the target AWS account with `enable_custom_domain = false`
4. Deploy `stacks/hashpass-web` in the target AWS account and validate either the CloudFront domain or the S3 website endpoint, depending on the account state
5. Deploy `stacks/mobile-release-target` in the target AWS account and verify a test Android build
6. Re-run the BSL pipeline provisioning against the target account once the hosted zone exists
7. Configure frontend env vars:
   - dev: `EXPO_PUBLIC_API_BASE_URL=https://api-dev.hashpass.tech/api`
   - prod: `EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api`
   - dev: `EXPO_PUBLIC_DIRECTUS_URL=https://sso-dev.hashpass.co`
   - prod: `EXPO_PUBLIC_DIRECTUS_URL=https://sso.hashpass.co`
8. Publish the club site through the `club-v*` GitHub Pages workflow, then validate OAuth callback + profile load end-to-end

## Notes

- This new stack is isolated from legacy `packages/infra/terraform/gcp` files.
- Keep secrets out of `.tfvars`; use environment variables or secret managers when possible.
