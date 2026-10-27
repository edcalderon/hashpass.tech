# HASHPASS Companion site (staging)

Static hosting for the standalone Companion web app (`apps/companion`, issue
[#469](https://github.com/hashpass-tech/hashpass.tech/issues/469)): private S3 origin,
CloudFront with Origin Access Control and the AWS managed security-headers policy, and Route 53
A/AAAA aliases. It reuses the existing `*.hashpass.tech` ACM certificate. Unknown paths fall back
to `/index.html` (single-page app).

## Status

Two environments share this stack, each in its own local Terraform workspace so one never replaces the other:

| Environment | Workspace | Domain | Bucket | Applied |
| --- | --- | --- | --- | --- |
| Staging | `default` | `companion-dev.hashpass.tech` | `hashpass-companion-dev-site` | 2026-10-27 (10 resources) |
| Production | `production` | `companion.hashpass.tech` | `hashpass-companion-site` | 2026-10-27 (10 resources, CloudFront `E32V52S2B8W83B`) |

Production is provisioned but **empty**: until a build is published, CloudFront answers 403 for the S3 origin
(SPA fallback needs an `index.html`). Staging serves a build. Terraform state is local and gitignored, so apply
from the same machine or move the state to a remote backend first; the workspaces live in
`terraform.tfstate.d/`.

## Safety gates (from #469)

- The `domain` variable only accepts `companion.hashpass.tech` or `companion-dev.hashpass.tech`; the default is staging.
- Use the `hashpass` AWS profile only, and compare the account with a non-printing check first.
- Cost is small (S3 plus CloudFront `PriceClass_100`, no compute) against the USD 50/month budget.

## Plan and apply

```bash
export TF_VAR_expected_account_id="$(grep -m1 '^AWS_TARGET_ACCOUNT_ID=' ../../../../../.env | cut -d= -f2-)"
# staging
terraform workspace select default && terraform plan -out=companion.tfplan
# production (the first time: terraform workspace new production)
terraform workspace select production
terraform plan -var domain=companion.hashpass.tech -var bucket_name=hashpass-companion-site -out=companion-prod.tfplan
# review the plan, then terraform apply <plan file>
```

Always pass the production `-var` pair to every plan in the `production` workspace, or Terraform will propose
moving it to the staging names.

## Publish a build

```bash
pnpm --filter @hashpass/companion build
aws s3 sync apps/companion/dist "s3://$(terraform output -raw bucket_name)" --delete --profile hashpass
aws cloudfront create-invalidation --distribution-id "$(terraform output -raw distribution_id)" --paths '/*' --profile hashpass
```

Not built yet: a GitHub Actions deploy role and workflow (model them on `lukas-landing-deploy.yml`).
The site source lives in `apps/companion` (own `companion-vX.Y.Z` release stream; see CLAUDE.md "Companion release").
CI for it is `.github/workflows/companion.yml` (test and build only, no deploy).
