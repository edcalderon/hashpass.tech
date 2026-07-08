# HASHPASS Terraform IaC (AWS + GCP)

This Terraform setup deploys the live HASHPASS infra surfaces:

- Source CloudFront front door:
  - `hashpass.tech`
  - `dev.hashpass.tech`
- Target-account web origin:
  - `hashpass.tech` static site pipeline
  - `dev.hashpass.tech` development pipeline
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

- `stacks/aws`: source CloudFront front door + GitHub Pages DNS for `hashpass.club`
- `stacks/gcp`: GCP Directus VM(s) + optional Cloud DNS records
- `stacks/hashpass-dns`: target-account Route 53 hosted zones for the migration cutover
- `stacks/hashpass-api-target`: target-account API Gateway + Lambda stack for `api.hashpass.tech`
- `stacks/hashpass-web`: target-account CodePipeline + EC2 worker stack for `hashpass.tech` and `dev.hashpass.tech`
- `stacks/mobile-release`: AWS EC2 self-hosted GitHub Actions runner for mobile Android builds
- `stacks/mobile-release-target`: isolated target-account Android runner stack used during migration, with its own `hashpass-mobile-release-target` label
- `modules/aws_expo_router_api`: reusable Lambda + HTTP API + custom domain module
- `modules/aws_amplify_domain`: legacy custom domain binding module retained for archived migration references
- `modules/aws_static_site_pipeline`: reusable S3 + CloudFront + CodePipeline site module with a custom EC2 build action
- `modules/gcp_directus_instance`: reusable Directus compute module
- `modules/aws_github_actions_runner`: reusable EC2 GitHub Actions runner module

## Prerequisites

1. Terraform `>= 1.5`
2. AWS credentials configured (for Route53, ACM, CloudFront, API Gateway, Lambda)
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

- the source-account CloudFront distribution/domain for `hashpass.tech` and `dev.hashpass.tech`
- the origin domain wired behind the front door
- the target-account static origin metadata used by the web pipeline

### HASHPASS Web Stack

This stack provisions the target-account replacement for the `hashpass.tech`
web origin. It creates both the production and development pipelines in the
same Terraform state. It creates:

- an S3 bucket for the built site
- a CloudFront distribution with the S3 bucket as origin when the account is verified for CloudFront
- an S3 website fallback when CloudFront is disabled
- a dedicated EC2 build worker that polls a custom CodePipeline build action and runs the shared build/deploy helpers
- a CodePipeline that pulls from GitHub and triggers the EC2 worker
- a matching development pipeline that builds from `develop` with the dev Supabase inputs
- a `dev.hashpass.tech` record in the target `hashpass.tech` hosted zone when the DNS stack is present
- API Lambda deploy wiring for `hashpass-prod-expo-router-api` and `hashpass-dev-expo-router-api`

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
- `dev_route53_zone_name` if you want to override the hosted zone used for `dev.hashpass.tech`
- `dev_custom_domain_name` if you want to override the `dev.hashpass.tech` hostname
- `site_bucket_name` and `dev_site_bucket_name` only if you want fixed bucket names; otherwise let Terraform generate unique names and point Route 53 at the resulting website endpoints
- `site_acm_certificate_arn` once you have requested and validated the `hashpass.tech` ACM certificate in `us-east-1`
- `lambda_function_name`, `dev_lambda_function_name`, `api_version_url`, and `dev_api_version_url` only if the active Lambda names or API hostnames differ from the defaults

Apply it with:

```bash
./packages/infra/terraform/scripts/stack.sh hashpass-web plan
./packages/infra/terraform/scripts/stack.sh hashpass-web apply
```

CloudFront is now the production front door for `hashpass.tech`, and the same
source-account front door also serves `dev.hashpass.tech` so the public dev URL
stays on HTTPS. Both hostnames point at the target-account S3 website origins,
which keeps the origin static while the target account remains blocked from
creating new CloudFront resources by AWS account verification.
The current live layout is:
- `hashpass.tech` resolves through the source-account CloudFront front door.
- `www.hashpass.tech` remains a CNAME to `hashpass.tech` and is covered by the
  same CloudFront certificate.
- `dev.hashpass.tech` is routed through the source-account CloudFront front
  door and aliases directly from the parent `hashpass.tech` hosted zone.
- The target `hashpass.tech` hosted zone still carries the static origin used
  by the source CloudFront front door.
The target web stack still uses a single shared EC2 build worker plus
CodePipeline. Keep `build_worker_instance_count = 1` unless you
need concurrent dev and prod throughput; a second worker only helps parallel
queues and increases idle cost. The worker runs the same
`packages/tools/scripts/build-static-site.sh` and
`packages/tools/scripts/deploy-static-site.sh` helpers that local testing uses.
The deploy helper also packages and updates the Expo Router API Lambda when the
stack provides `SITE_LAMBDA_FUNCTION_NAME` and `SITE_LAMBDA_REGION`. It then
checks `SITE_API_VERSION_URL` against the repository version, so the pipeline
fails if `api.hashpass.tech` or `api-dev.hashpass.tech` is still serving stale
API code after the deploy.
The recommended worker shape is `m6i.large`; the old burstable `t3a.medium`
shape can exhaust CPU credits during Expo export and stretch the pipeline to
25+ minutes.
When CloudFront is available, the deploy helper invalidates it automatically;
for the current direct-S3 fallback, the stack uses literal A records instead of
Route 53 alias records because the alias form was not resolving cleanly in the
target zone.
Keep the site buckets on generated unique names unless you have a specific
reason to pin them. The bucket name does not need to match the apex record when
CloudFront is handling the public domain or when direct A records are used.
When `dev_enable_cloudfront = true`, the stack also creates a DNS-validated
ACM certificate in `us-east-1` for `dev.hashpass.tech` and can point the Route
53 alias at a target-account CloudFront distribution instead of the S3 website
endpoint. Until then, the public dev hostname should remain on the source
CloudFront front door so browsers always get HTTPS.
The EC2 worker role also gets bucket-level S3 permissions only for the deploy
buckets passed in by the stack, which is required for `aws s3 sync --delete`
and the HTML cache refresh `aws s3 cp` calls.
The worker uses the short-lived CodePipeline artifact credentials only to fetch
the source bundle; the final artifact upload stays on the instance profile so
long builds do not fail when the job token expires.
If you enable `enable_github_actions_worker_control = true`, the stack also
creates a least-privilege GitHub Actions role that can read CodePipeline state
and start/stop the shared EC2 worker fleet by matching `Project` and `Service`
tags. Copy the
`github_actions_role_arn` output into the GitHub variable
`AWS_WEB_PIPELINE_ROLE_ARN`, then use the monitor workflow in
`.github/workflows/hashpass-web-pipeline-monitor.yml` to keep the worker off
when both the dev and production pipelines are idle. If the repo variable is
not set yet, you can pass the same role ARN as the manual
`aws_web_pipeline_role_arn` workflow dispatch input.
That workflow is the normal control plane for the worker lifecycle. It now
includes a periodic stop sweep in addition to the push-triggered monitor so an
idle worker can still be reclaimed if no later commit arrives. Use GitHub
Actions to start, monitor, or stop the EC2 instance by tag, and keep direct
target-account AWS CLI usage for bootstrap or emergency debugging only.
The target Supabase compatibility layer for the target-account migration lives in
`packages/tools/scripts/sql/target-bsl-bootstrap.sql`. Apply it before testing
the new web/API path, and keep future target-side database changes in checked-in
SQL migrations rather than ad hoc console edits.
Before removing the remaining source-account API/Lambda leftovers,
verify that the source CloudFront front door is serving `https://hashpass.tech`
from the target origin and that the DNS answers are stable. The source account
is no longer the public API path; keep the front door only until you are
satisfied the new routing is healthy.

```bash
gh workflow run hashpass-web-pipeline-monitor.yml -f mode=monitor
gh workflow run hashpass-web-pipeline-monitor.yml -f mode=stop
```

### HASHPASS DNS Stack

This stack creates the target-account hosted zones for the migration. It now
leaves `dev.hashpass.tech` inside the parent `hashpass.tech` zone instead of
creating a separate child zone. It does not delegate the registrar by itself,
so it is safe to apply before DNS cutover.

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

- hosted zone IDs for `hashpass.tech`, `hashpass.lat`, and `hashpass.club`
- nameserver sets for later registrar delegation

### HASHPASS API Stack

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

The target stack now owns the public custom domains as part of the migration.
Keep `enable_custom_domain = true` so the Route 53 aliases stay on the target
account and the public `api.hashpass.tech` and `api-dev.hashpass.tech` names
continue to resolve through the target custom domains.
Leave `api_mapping_key` empty for this stack so the public `api.hashpass.tech`
domain preserves the app's `/api/...` routes instead of stripping the prefix.
Keep `dev.hashpass.tech` delegated from the source parent hosted zone to the
target parent `hashpass.tech` hosted zone during migration and leave the apex
`hashpass.tech` routing on the source hosted zone until the final cutover. The
target API stack can be validated independently because its custom domains now
live in the target account.
The Lambda DB connection must use a pooler-form URL. For dev, the host should
be `aws-0-us-east-2.pooler.supabase.com`; for prod, use
`aws-1-us-west-2.pooler.supabase.com`. Direct `db.<ref>.supabase.co` URLs can
fail DNS lookups from Lambda even when the Supabase project itself is valid.

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
3. Deploy `stacks/hashpass-api-target` in the target AWS account with `enable_custom_domain = true`
4. Deploy `stacks/hashpass-web` in the target AWS account and validate either the CloudFront domain or the S3 website endpoint, depending on the account state
5. Deploy `stacks/mobile-release-target` in the target AWS account and verify a test Android build, then keep its label distinct from the source runner label so GitHub does not dispatch release jobs to the wrong fleet
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
