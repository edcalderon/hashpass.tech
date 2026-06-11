# HashPass Multi-Cloud IaC (AWS + GCP)

This Terraform setup deploys the production naming convention discussed for HashPass:

- Frontend (Amplify):
  - `blockchainsummit.hashpass.lat`
  - `blockchainsummit-dev.hashpass.lat`
- API (AWS Lambda + API Gateway):
  - `api.hashpass.tech`
  - `api-dev.hashpass.tech`
- Directus (GCP):
  - `sso.hashpass.co`
  - `sso-dev.hashpass.co`

## Structure

- `stacks/aws`: AWS API + optional Amplify domain association + GitHub Pages DNS for `hashpass.club`
- `stacks/gcp`: GCP Directus VM(s) + optional Cloud DNS records
- `modules/aws_expo_router_api`: reusable Lambda + HTTP API + custom domain module
- `modules/aws_amplify_domain`: reusable Amplify custom domain binding module
- `modules/gcp_directus_instance`: reusable Directus compute module

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

## Suggested Deploy Order

1. Deploy `stacks/gcp` (get static IPs for Directus)
2. Update DNS for `sso-dev.hashpass.co` and `sso.hashpass.co` (if not using Cloud DNS in module)
3. Deploy `stacks/aws` (API domains + Lambda + GitHub Pages DNS records)
4. Configure frontend env vars:
   - dev: `EXPO_PUBLIC_API_BASE_URL=https://api-dev.hashpass.tech/api`
   - prod: `EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api`
   - dev: `EXPO_PUBLIC_DIRECTUS_URL=https://sso-dev.hashpass.co`
   - prod: `EXPO_PUBLIC_DIRECTUS_URL=https://sso.hashpass.co`
5. Publish the club site through the `club-v*` GitHub Pages workflow, then validate OAuth callback + profile load end-to-end

## Notes

- This new stack is isolated from legacy `packages/infra/terraform/gcp` files.
- Keep secrets out of `.tfvars`; use environment variables or secret managers when possible.
