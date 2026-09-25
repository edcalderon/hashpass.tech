# Deployment Map

This is the operational source of truth for live HASHPASS delivery. Always use
the `hashpass` AWS profile; `default` is legacy LSTS cleanup-only. Build routing
below was verified on **2026-09-21**; the build-cost cutover did not move the
existing S3 origins or CloudFront delivery.

## Domain → hosting

| Domain | Serving service | Authorized AWS profile | Deployment path |
| --- | --- | --- | --- |
| `hashpass.tech`, `www.hashpass.tech` | CloudFront + S3 static site | `hashpass` | [`github-hosted-tenant-site-deploy.yml`](../../../../.github/workflows/github-hosted-tenant-site-deploy.yml), target `production`, matching `main` pushes |
| `dev.hashpass.tech` | CloudFront + S3 static site | `hashpass` | [`github-hosted-static-site-deploy.yml`](../../../../.github/workflows/github-hosted-static-site-deploy.yml), matching `develop` pushes |
| CBWeek development | Existing CloudFront + S3 static site | `hashpass` | Tenant workflow, target `cbweek-development`, matching `develop` pushes |
| `api.hashpass.tech`, `api-dev.hashpass.tech` | Lambda + API Gateway, `us-east-1` | `hashpass` | Corresponding core web deploy with version-endpoint guard |
| `bsl.hashpass.tech`, `bsl-dev.hashpass.tech` | Existing cross-account CloudFront + production-account static origins | `hashpass` for origin deployment | Tenant workflow, targets `bsl-production` / `bsl-development`, matching `main` / `develop` pushes |
| `hashpass.club` | GitHub Pages | n/a | `club-v*` release workflow |
| `hashpass.link`, `hpass.id`, `hashp.link` | Shared Lambda + API Gateway | `hashpass` | Terraform-managed links API |

## Account boundary

The `hashpass` account owns the authoritative `hashpass.tech` Route 53 zone,
the current build/deploy targets, API, and USD 50 monthly budget. BSL's existing
cross-account CloudFront delivery remains unchanged; do not infer that every
serving distribution moved into this account during the build migration.
Verify STS identity against private `AWS_TARGET_ACCOUNT_ID` without printing
account IDs before mutations. The repository-level `AWS_ACCOUNT_ID` belongs
to older infrastructure workflow configuration and does not match production;
do not reuse or overwrite it without auditing its consumers.

The `default` account is not a production fallback. Its old Amplify sites,
disabled CloudFront distributions, and stale HashPass configuration are being
retired. Do not point DNS, pipelines, or application configuration at it.

## Build compute and retained recovery

The primary workflows build without AWS credentials on standard GitHub-hosted
`ubuntu-latest` runners, then use separate scoped OIDC deploy jobs. Tenant
deployment environments enforce the target's source branch. Manual dispatch
defaults to build-only; publishing requires `deploy=true`.

BSL uses `packages/tools/scripts/build-bsl-static-site.sh`, not SST. Its deploy
jobs update only the existing S3 origins; they do not change the cross-account
CloudFront setup.

All five AWS site pipelines are now **manual recovery only**: no V2 push triggers
and explicit source `DetectChanges=false`:

- `hashpass-dev-site`
- `hashpass-cbweek2026-develop-site`
- `bsl-hashpass-dev`
- `hashpass-production-site`
- `bsl-hashpass-prod`

The pipelines and CodeBuild projects remain available for owner-approved
recovery; they are not normal release triggers. No EC2 instances were present
in `us-east-1` or `us-east-2` at verification. Do not provision or re-enable
workers without explicit owner approval. See [github-outage-monitor.md](github-outage-monitor.md)
for outage detection and the
[canonical build-cost task](../../../../.agents/active/task-build-cost-containment-and-cicd-migration.md)
for verified deployment evidence, recovery safeguards, and remaining cost
observation. Historical EC2 hang diagnostics are not instructions to restore
that build path.

**Separate legacy workflow:** [`infra-deploy.yml`](../../../../.github/workflows/infra-deploy.yml)
remains active, with matching `main`/`develop` push triggers and manual dispatch.
It runs on GitHub-hosted compute, attempts SST deployment, then runs the API
deployment helper through `AWS_WEB_PIPELINE_ROLE_ARN`. It is not the primary site
build path and was not disabled by the CodePipeline cutover. Audit its remaining
infrastructure/API responsibilities separately before changing it; do not label
it manual-only or infer that it re-enables automatic paid CodePipeline builds.

## Checking status

```bash
gh run list --repo hashpass-tech/hashpass.tech --workflow github-hosted-static-site-deploy.yml --limit 5
gh run list --repo hashpass-tech/hashpass.tech --workflow github-hosted-tenant-site-deploy.yml --limit 5
gh run list --repo hashpass-tech/hashpass.tech --workflow infra-deploy.yml --limit 5
gh run view <RUN_ID> --repo hashpass-tech/hashpass.tech
```

Check the resulting public site and API version as well as the GitHub run.
Budget email alerts are live. The daily cost/trigger guard is prepared
in [`aws-cost-report.yml`](../../../../.github/workflows/aws-cost-report.yml). It keeps
the last sent cost values in one encrypted private SSM parameter, so an already
breached budget sends its first alert immediately and only repeats after spend or
forecast moves by at least USD 5; apply `github-cost-report.yml` before promoting
the corresponding workflow change. Its 13:20 UTC schedule awaits
[PR #249](https://github.com/hashpass-tech/hashpass.tech/pull/249) reaching `main`.
A trigger-drift report can fail while every budget check passes; alerts do not
stop spending or reverse accrued charges.

## Deployment guardrails

- Never use an archived Amplify script for a live HASHPASS deployment.
- `blockchainsummit.hashpass.lat` was an experiment and is retired; it has no
  deploy target or tenant configuration.
- `bsl.hashpass.tech` is the active BSL production hostname.
- A web/API release is not complete until the relevant `/api/config/versions`
  endpoint reports the released version.
- The production cost budget is `hashpass-production-monthly-max-50-usd`.
