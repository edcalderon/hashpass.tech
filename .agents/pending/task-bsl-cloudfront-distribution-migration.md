# Task: Migrate BSL/main-site CloudFront distributions to the target account

## Status

**Blocked** — waiting on an AWS Support case for target-account CloudFront
verification. Not actionable until that resolves; revisit when it does.

## Background

Follows on from `.agents/done/task-aws-account-migration.md` (moved to done
2026-07-29). All BSL compute (S3 buckets, build pipelines) is fully migrated
to the target account (`<target-account-id>`) and the source account
(`<source-account-id>`) has zero remaining BSL resources of any kind. The
one piece still on source is the CloudFront distributions themselves plus
DNS, for both BSL and the main site:

| Domain | Distribution ID | Account |
|---|---|---|
| `bsl.hashpass.tech` | `E2FCDJB1JCS7TW` | source |
| `bsl-dev.hashpass.tech` | `E279RW9PP52TC0` | source |
| `hashpass.tech` / `www.hashpass.tech` | `E2SQE7ZSNJ4MMI` | source |
| `dev.hashpass.tech` | `E2A1QBPJVGUFI4` | source |

All four already point their origins at target-account S3 buckets (the
hybrid shape) — this is a stable, working setup, not a broken one. This
task exists only for the possibility of moving the distributions
themselves once the target account can create CloudFront resources.

## Why it's blocked

The target account cannot call `CreateDistribution` at all —
`AccessDenied: Your account must be verified before you can add new
CloudFront resources`, a normal AWS anti-fraud check for new/low-usage
accounts, not a misconfiguration. AWS Support case submitted 2026-07-28
(framed as internal business-unit migration/segregation). As of 2026-07-29
the target account still has **zero** CloudFront distributions — nothing
approved yet.

## What to do once the ticket resolves

1. Confirm the verification actually unblocked `CreateDistribution` — try
   a real (or throwaway) `aws cloudfront create-distribution` call in the
   target account rather than trusting the ticket status alone.
2. Decide, don't assume: the hybrid shape (CDN+DNS on source, compute on
   target) is already the **permanent** decision for `hashpass.tech`/
   `dev.hashpass.tech` — it may be reasonable to keep BSL on that same
   permanent hybrid shape rather than migrate the distributions at all.
   Weigh actual benefit (one fewer cross-account hop) against migration
   cost (new distributions, new ACM certs, a real DNS cutover window) before
   doing this just because it's newly possible.
3. If migrating: for each domain, create the new target-account
   distribution + ACM cert (remember the cross-account ACM DNS-validation
   gap documented in the done task — SST/CLI under target credentials only
   sees the target account's non-authoritative shadow zone; the validation
   CNAME must be added to the source-account zone by hand), validate it
   fully in parallel before touching DNS, then cut the source-zone alias
   record over, then decommission the old source-account distribution only
   after the new one is confirmed serving correctly.
4. Take proper Terraform ownership either way — none of these four
   distributions are currently IaC-managed; their origins were repointed
   via one-time manual `update-distribution` CLI calls. A `terraform
   import` (source-account provider, or target if migrated) would close
   that gap.

## Other still-open infra items (carried over, not distribution-related)

Small enough to not warrant their own task files, but shouldn't get lost:

- **EC2 pipeline worker `build_timeout_seconds` guard** — committed
  (`c3e41073a`, `modules/aws_pipeline_ec2_worker`) but not applied to
  either `bsl-target` or `hashpass-web`. Applying replaces the EC2 instance
  (`terraform plan` confirmed destroy+recreate), so do it while no pipeline
  execution is in flight. Apply to `hashpass-web` requires real
  `terraform.tfvars` values, which aren't currently available locally.
- **`mobile-release-target`'s Terraform state** doesn't match its committed
  `terraform.tfvars.example` — a real plan previews 15 resources
  destroyed/recreated (IAM roles, security group, CloudWatch alarms/
  dashboard). Needs someone to reconstruct the real values from the live
  resources before this stack is safe to apply again.
- **`bitacora.hashpass.tech`** — CloudFront distribution `E21D0HJJTEQMO0`
  exists in the source account (SST placeholder origin, same shape as BSL's
  old setup) but is undocumented anywhere in this repo. Needs someone to
  say what it is before it can be migrated, documented, or written off.
- **Stale `.club`/`.lat` target-account hosted zones** — incomplete
  2-record copies, serve no purpose since zone hosting isn't moving. Either
  finish syncing or delete.
- **Target-account diagnostic CodeBuild projects** (`hashpass-arm-probe-*`,
  `hashpass-lambda-probe-*`) — low priority cleanup, confirm no longer
  needed then delete.
