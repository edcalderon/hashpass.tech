# HASHPASS Companion site (staging)

Static hosting for the standalone Companion web app (`apps/companion`, issue
[#469](https://github.com/hashpass-tech/hashpass.tech/issues/469)): private S3 origin,
CloudFront with Origin Access Control and the AWS managed security-headers policy, and Route 53
A/AAAA aliases. It reuses the existing `*.hashpass.tech` ACM certificate. Unknown paths fall back
to `/index.html` (single-page app).

## Status

**Applied 2026-10-27 to the `hashpass` account (10 resources).** `https://companion-dev.hashpass.tech`
serves a placeholder page (HTTP 200, SPA fallback, HSTS and `nosniff` headers verified from
outside). The companion itself is not built; the page says so. `companion.hashpass.tech`
(production) has no DNS records and is not provisioned. Terraform state is local and gitignored,
so apply from the same machine or move the state to a remote backend first.

## Safety gates (from #469)

- Default `domain` is `companion-dev.hashpass.tech`. The variable only accepts
  `companion.hashpass.tech` or `companion-dev.hashpass.tech`; production needs separate approval.
- Use the `hashpass` AWS profile only, and compare the account with a non-printing check first.
- Cost is small (S3 plus CloudFront `PriceClass_100`, no compute) against the USD 50/month budget.

## Plan and apply

```bash
export TF_VAR_expected_account_id="$(grep -m1 '^AWS_TARGET_ACCOUNT_ID=' ../../../../../.env | cut -d= -f2-)"
terraform init && terraform plan -out=companion.tfplan   # review, then:
terraform apply companion.tfplan
```

## Publish a build

```bash
pnpm --filter @hashpass/companion build
aws s3 sync apps/companion/dist "s3://$(terraform output -raw bucket_name)" --delete --profile hashpass
aws cloudfront create-invalidation --distribution-id "$(terraform output -raw distribution_id)" --paths '/*' --profile hashpass
```

Not built yet: a GitHub Actions deploy role and workflow (model them on `lukas-landing-deploy.yml`).
The site source lives in `apps/companion` (own `companion-vX.Y.Z` release stream; see CLAUDE.md "Companion release").
CI for it is `.github/workflows/companion.yml` (test and build only, no deploy).
