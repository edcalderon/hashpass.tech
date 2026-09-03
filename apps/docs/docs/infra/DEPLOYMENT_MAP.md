# Deployment Map

This is the operational source of truth for live HASHPASS delivery. Always use
the `hashpass` AWS profile; `default` is legacy LSTS cleanup-only.

## Domain → hosting

| Domain | Production service | AWS profile | Deployment path |
| --- | --- | --- | --- |
| `hashpass.tech`, `www.hashpass.tech` | CloudFront + S3 static site | `hashpass` | Production web pipeline on `main` |
| `dev.hashpass.tech` | CloudFront + S3 static site | `hashpass` | Development web pipeline on `develop` |
| `api.hashpass.tech`, `api-dev.hashpass.tech` | Lambda + API Gateway, `us-east-1` | `hashpass` | Web/API deployment flow with version-endpoint guard |
| `bsl.hashpass.tech`, `bsl-dev.hashpass.tech` | CloudFront + target-account static origins | `hashpass` | Dedicated BSL CodePipeline/EC2 worker |
| `hashpass.club` | GitHub Pages | n/a | `club-v*` release workflow |
| `hashpass.link`, `hpass.id`, `hashp.link` | Shared Lambda + API Gateway | `hashpass` | Terraform-managed links API |

## Account boundary

The `hashpass` account owns the authoritative `hashpass.tech` Route 53 zone,
all active CloudFront distributions, BSL, the API, and the USD 50 monthly
budget. Verify its STS identity without printing account IDs before mutations.

The `default` account is not a production fallback. Its old Amplify sites,
disabled CloudFront distributions, and stale HashPass configuration are being
retired. Do not point DNS, pipelines, or application configuration at it.

## Deployment guardrails

- Never use an archived Amplify script for a live HASHPASS deployment.
- `blockchainsummit.hashpass.lat` was an experiment and is retired; it has no
  deploy target or tenant configuration.
- `bsl.hashpass.tech` is the active BSL production hostname.
- A web/API release is not complete until the relevant `/api/config/versions`
  endpoint reports the released version.
- The production cost budget is `hashpass-production-monthly-max-50-usd`.
