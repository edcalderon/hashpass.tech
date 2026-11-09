---
id: aws-deployment-account-identity
type: architecture-design
status: draft
title: AWS deployment account identity guard
tags: [aws, ci-cd, release-safety]
---

## Drivers
A production deployment run emitted an `Unexpected input(s) 'allowed-account-ids'` warning, so the
intended account allowlist was not enforced by the credentials action. Deployment safety must verify
the identity of the credentials actually assumed, rather than relying on role configuration alone.

## Decisions
AWS-mutating jobs in the protected `develop -> main` promotion and matching `develop` deployment
perform an explicit STS caller-account check after each role assumption and before the first mutation.
This includes tenant-site deployment, core migration backup, and the legacy infrastructure/API jobs.
The optional EC2 runner lifecycle in the Android release workflow is also guarded when selected; the
tag-triggered flow normally uses GitHub-hosted runners and skips those AWS jobs. Every check receives
an independent, explicit expected account ID; it is never inferred from the role ARN. The legacy
infrastructure/API workflow binds its deployment job to `production` on `main` and `bsl-development`
on `develop`, then checks each assumed role against that environment's `AWS_TARGET_ACCOUNT_ID`. The
repository-level `AWS_ACCOUNT_ID` is not a fallback because it belongs to a different account. Other
target-scoped jobs use their active environment variable or an action input. Workflow steps invoke the
shared verifier so scripts shared with legacy CodeBuild or local paths retain their
credential-source-agnostic behavior. A workflow whose active environment
lacks an explicit expected ID remains blocked until an approved mapping is available; the development
static-site workflow currently has this gap.

## Invariants
- Missing or malformed expected account IDs, failed or malformed caller-identity lookups, and
  account mismatches fail closed before mutation.
- Expected account IDs must be independently configured; deriving them from a role ARN is not an
  approved fallback.
- GitHub Actions masks valid expected and actual account IDs; operator-facing output never prints
  them.
- This check supplements, but does not replace, least-privilege IAM policies, OIDC trust
  restrictions, or protected environments and branches.

## Out of scope
Identity verification does not authorize a deployment, Terraform apply, production migration, DNS
change, or other production mutation; those actions remain subject to their separate approvals.
Manually dispatched infrastructure/campaign workflows and retained CodePipeline/CodeBuild
manual-recovery paths are not changed by this patch-release guard. Local AWS CLI mutations remain
restricted to the `hashpass` profile and its expected account.
