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

- `stacks/aws`: AWS API + optional Amplify domain association
- `stacks/gcp`: GCP Directus VM(s) + optional Cloud DNS records
- `modules/aws_expo_router_api`: reusable Lambda + HTTP API + custom domain module
- `modules/aws_amplify_domain`: reusable Amplify custom domain binding module
- `modules/gcp_directus_instance`: reusable Directus compute module

## Prerequisites

1. Terraform `>= 1.5`
2. AWS credentials configured (for Route53, ACM, API Gateway, Lambda, Amplify)
3. GCP credentials configured (ADC or `GOOGLE_APPLICATION_CREDENTIALS`)
4. Lambda package built at the configured path:
   - Example: `./tools/scripts/package-lambda.sh`
5. GCP Secret Manager secrets created:
   - `directus-env-dev`
   - `directus-env-prod`
   - each secret must contain the full Directus `.env` content for that environment

If your GCP account cannot manage Secret Manager, use `directus_env_file_paths` in `stacks/gcp/terraform.tfvars` instead.
If your startup Git ref does not contain the compose path, use `directus_compose_file_paths` to inject `docker-compose.yml` directly.
<<<<<<< Updated upstream
Never commit filled `.env` files to git; keep only `.example` templates in VCS.
=======
>>>>>>> Stashed changes

## Quick Start

### AWS Stack

```bash
cd infrastructure/terraform/stacks/aws
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Shortcut:

```bash
./infrastructure/terraform/scripts/stack.sh aws plan
./infrastructure/terraform/scripts/stack.sh aws apply
```

Outputs include:

- API base URLs for frontend env vars
- Lambda names
- domain association metadata if Amplify association is enabled

<<<<<<< Updated upstream
Apply strict Amplify cache headers (recommended to avoid stale `/auth` screens after deploys):

```bash
./tools/scripts/apply-amplify-custom-headers.sh d951nuj7hrqeg sa-east-1
```

Header source file:

- `infrastructure/terraform/stacks/aws/custom-headers.blockchainsummit.yml`

If an Amplify app/domain already exists, import it before apply:

```bash
terraform import -var-file=terraform.tfvars 'module.frontend_domain_association[0].aws_amplify_domain_association.this' '<AMPLIFY_APP_ID>/hashpass.lat'
terraform import -var-file=terraform.tfvars 'aws_amplify_branch.frontend["develop"]' '<AMPLIFY_APP_ID>/develop'
terraform import -var-file=terraform.tfvars 'aws_amplify_branch.frontend["main"]' '<AMPLIFY_APP_ID>/main'
```

=======
>>>>>>> Stashed changes
### GCP Stack

```bash
cd infrastructure/terraform/stacks/gcp
cp terraform.tfvars.example terraform.tfvars
<<<<<<< Updated upstream
cp directus.dev.env.example directus.dev.env
# create directus.prod.env the same way if you deploy prod from this stack
=======
>>>>>>> Stashed changes
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Shortcut:

```bash
./infrastructure/terraform/scripts/stack.sh gcp plan
./infrastructure/terraform/scripts/stack.sh gcp apply
```

Outputs include:

- Directus instance names
- static IPs
- SSH commands

## Suggested Deploy Order

1. Deploy `stacks/gcp` (get static IPs for Directus)
2. Update DNS for `sso-dev.hashpass.co` and `sso.hashpass.co` (if not using Cloud DNS in module)
3. Deploy `stacks/aws` (API domains + Lambda)
4. Configure frontend env vars:
   - dev: `EXPO_PUBLIC_API_BASE_URL=https://api-dev.hashpass.tech/api`
   - prod: `EXPO_PUBLIC_API_BASE_URL=https://api.hashpass.tech/api`
   - dev: `EXPO_PUBLIC_DIRECTUS_URL=https://sso-dev.hashpass.co`
   - prod: `EXPO_PUBLIC_DIRECTUS_URL=https://sso.hashpass.co`
5. Validate OAuth callback + profile load end-to-end

## Notes

- This new stack is isolated from legacy `infrastructure/terraform/gcp` files.
- Keep secrets out of `.tfvars`; use environment variables or secret managers when possible.
