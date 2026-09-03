# HASHPASS AWS Account Cutover

> Status: complete. Last verified 2026-09-02.

All live HASHPASS infrastructure is in the AWS account selected by the local
`hashpass` profile. This includes the authoritative `hashpass.tech` Route 53
zone, production and development CloudFront distributions, BSL, web/API
delivery, mobile-release resources, and the USD 50 monthly cost budget.

The `default` profile is a legacy LSTS account. It is decommissioning-only:
never deploy HASHPASS resources, apply Terraform, or create budgets there.

## Required operator check

Before mutating AWS, select `hashpass` explicitly and compare its STS account
identity to the private expected account ID without printing it. Do the same
check before any legacy cleanup with `default`.

## Completion evidence

- Public `hashpass.tech` NS records match the hosted zone in the production account.
- `bsl.hashpass.tech` and `bsl-dev.hashpass.tech` resolve to production-account CloudFront distributions.
- The old experimental Amplify sites, disabled legacy CloudFront distributions,
  legacy EBS volumes, and legacy HashPass parameter/secret copies have been retired.

## Legacy cleanup policy

Only delete a resource in `default` after confirming that it is HashPass-owned,
has no live alias or workload, and has a replacement in `hashpass` where it
contains operational state. Do not remove unrelated LSTS resources merely
because they share the legacy account.
