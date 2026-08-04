# Task: AWS cost audit and credit protection

**Status:** PENDING — high priority  
**Priority:** P0 (billing/credit risk)  
**Created:** 2026-08-04

## Trigger and current signal

The AWS Cost Explorer dashboard reported:

- month-to-date net unblended cost: **$35.21**;
- same-period prior month: **$12.14** (**+190%**);
- current-month forecast: **$238.98** (**+361%** versus the prior month total of
  **$51.84**);
- an available **$200 USD credit** is at risk of being exceeded by the
  forecast.

These dashboard values must be reconciled against the billing account and
credits ledger before treating the forecast as an invoice. A read-only Cost
Explorer query from the current CLI identity for 2026-08-01 through
2026-08-04 returned effectively zero usage, so account, payer, region,
credits, and Cost Explorer data-lag differences are an explicit first check.

## Goal

Identify the services and resources driving the increase, protect the remaining
credit, and establish an owner-approved monthly cost ceiling without breaking
production, release automation, or the development environment.

## Phase 1 — reconcile billing facts (read-only)

- [ ] Record the payer account, linked account, currency, and credit IDs/expiry
      dates from Billing → Credits and Cost Management Preferences.
- [ ] Export Cost Explorer for current MTD, previous comparable period, and
      forecast using **UnblendedCost**, **AmortizedCost**, and **NetUnblendedCost**.
- [ ] Group by `SERVICE`, `REGION`, `LINKED_ACCOUNT`, `USAGE_TYPE`, and
      `RECORD_TYPE`; retain refunds/credits as separate lines.
- [ ] Compare the console export with `aws ce get-cost-and-usage` from the
      production billing account. Document the query time and the normal Cost
      Explorer ingestion delay.
- [ ] Confirm whether the $200 credit applies to this payer account and which
      services it covers. Do not count it as cash until the credit terms confirm
      the scope and expiry.

## Phase 2 — inventory likely drivers

Audit without deleting or stopping anything:

- EC2 instances, EBS volumes/snapshots, Elastic IPs, NAT gateways, load
  balancers, and idle development runners;
- ECS/Fargate tasks and CloudWatch log groups/retention;
- Lambda provisioned concurrency, API Gateway, SQS, and data transfer;
- S3, CloudFront, Amplify builds/hosting, ECR images, and Route 53;
- WorkMail/SES, KMS, Secrets Manager, and any cross-region replication;
- CI/Android release runners and schedules, including orphaned instances.

Every resource must be mapped to `environment` (`development` or
`production`), `service`, `owner`, and `cost-center` tags. Untagged resources
are findings, not automatic deletion candidates.

## Phase 3 — controls and savings plan

After the facts are reconciled and owners approve the plan:

1. Create monthly AWS Budgets for total spend and the highest-cost services;
   alert at 50%, 75%, 90%, and 100% of the approved ceiling.
2. Enable Cost Anomaly Detection for the payer and production linked account;
   route alerts to the on-call/admin channel and email.
3. Add a forecast alert below the credit limit (recommended initial trigger:
   $150 forecast, pending finance approval).
4. Enforce mandatory cost tags through IaC/review checks; report untagged
   spend weekly.
5. Right-size or schedule non-production EC2/ECS/runner capacity; remove only
   resources proven idle after an owner sign-off and a rollback window.
6. Set retention/lifecycle policies for logs, snapshots, artifacts, ECR, and
   S3 after confirming compliance requirements.
7. Review NAT/data-transfer architecture and CloudFront/Amplify build
   frequency before changing routing or caching.

## Safety and acceptance criteria

- [ ] Billing account and credit scope are reconciled with exported evidence.
- [ ] Top five cost drivers explain at least 95% of the MTD/forecast delta.
- [ ] Every recommended stop, resize, retention change, or deletion has an
      owner, expected monthly saving, risk, and rollback procedure.
- [ ] Budgets and anomaly alerts are active and tested with a non-production
      notification.
- [ ] No production resource is stopped or deleted by this task without a
      separate approved change window.
- [ ] A monthly cost report and credit burn-down are added to the operational
      review checklist.

## Non-goals

- Do not rotate credentials, change release workflows, or alter application
  databases as part of the billing audit.
- Do not delete resources based solely on an empty table, zero current usage,
  or an untagged-resource report.

