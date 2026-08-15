# Task: AWS cost audit and credit protection

**Status:** ACTIVE — high priority
**Priority:** P0 (billing/credit risk)  
**Created:** 2026-08-04
**Last updated:** 2026-08-15

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

### Read-only audit checkpoint — 2026-08-04

The current budget signal is materially over the approved ceiling:

- Budget: **$80.00/month**.
- Forecast: **$238.98**, or **$158.98 (199%) over budget**.
- The forecast also exceeds the reported **$200 credit** by **$38.98** if the
  credit applies to this account and all forecasted services.

Using the configured `hashpass` AWS profile, the caller is the target billing
account. A Cost Explorer query for 2026-08-01 through 2026-08-04, grouped by
service, returned only a few cents of estimated usage (mostly EC2-Other and
data transfer, with negligible Lambda). This does **not** reconcile with the
console forecast and must not be interpreted as proof that spend is low. The
remaining reconciliation checks are payer/linked-account scope, credit scope,
Cost Explorer ingestion delay, forecast date range, and whether the console is
showing a different account or billing view.

The target account inventory currently shows:

- no running EC2 instances;
- no available NAT gateways or unattached Elastic IPs;
- no ECS clusters;
- two Lambda functions: `hashpass-dev-expo-router-api` and
  `hashpass-prod-expo-router-api`;
- two CloudWatch log groups with 14-day retention (approximately 29 MB dev and
  116 MB production stored at audit time).

No resource was stopped, deleted, resized, or reconfigured during this audit.

### Current reconciliation update — 2026-08-15

Read-only follow-up work used the configured `hashpass` AWS profile (the
HashPass billing account), not the unrelated `default` source account.

- The console snapshot reports a forecasted month end of **$236.89** (357%),
  but Cost Explorer's current remaining-August `NET_UNBLENDED_COST` forecast
  through the CLI is **$127.87**. The CLI API cannot return the same whole-month
  forecast once the month has started, so this is an unresolved console/API
  reconciliation item rather than an invoice estimate.
- August gross usage is **$118.829**, exactly offset by a **-$118.829** credit.
  Net cost is therefore near zero, but the credit is being consumed and must
  not be treated as free capacity.
- The forecastable service components point to historical EC2-family usage:
  approximately **$26.81** for EC2 compute and **$12.36** for EC2-Other for
  the remaining days. These components do not sum to the aggregate forecast;
  Cost Explorer reports insufficient historical data for several individual
  service forecasts, so service-level forecasts must not be added to recreate
  the console number.
- No August Cost Anomaly Detection finding or Cost Optimization Hub
  recommendation was returned.
- In the regions with recent usage (`ap-southeast-1`, `ca-central-1`,
  `eu-west-1`, `sa-east-1`, `us-east-1`, and `us-east-2`), the current inventory
  contains no active EC2 instance, NAT gateway, RDS instance, load balancer,
  unattached Elastic IP, EBS volume, EBS snapshot, or VPC endpoint. No change
  was made.

**Current assessment:** Do not stop or delete production infrastructure without
an approved change window, but treat the forecast as a credit-burn risk. The
gross usage needs direct cost controls even while the credit masks net spend.

### Cost drivers and control status — 2026-08-15

- Gross August usage is concentrated in `us-east-2`: EC2 compute **$56.58**,
  CodeBuild **$33.63**, EC2-Other **$15.32**, CodePipeline **$5.62**, S3
  **$3.30**, VPC **$1.61**, and Route 53 **$1.50**. The highest usage types are
  `m6i.xlarge` compute (**$50.54**), CodeBuild large/medium minutes
  (**$33.63** combined), and gp3 storage (**$12.41** in `us-east-2`, plus
  **$2.69** elsewhere).
- CloudTrail history correlates EC2 usage with temporary development,
  production, and BSL build workers launched on 2026-08-01, repeatedly
  started/stopped by the pipeline monitor, and terminated on 2026-08-12/13.
  No matching compute, storage, NAT, RDS, load-balancer, Elastic-IP, snapshot,
  or VPC-endpoint resource remains active. Exact resource-level cost attribution
  requires payer-level Cost Explorer resource data, which is not enabled.
- The account already has two budgets, one service anomaly monitor, and two
  anomaly subscriptions (daily and immediate/$5). No anomaly event or Cost
  Optimization Hub recommendation was returned; the controls need threshold and
  routing validation because they did not prevent rapid build-cost accumulation.
- First approved actions: enable resource-level cost data; record cost and wall
  time for every EC2/CodeBuild run; then cap/review the four EC2 workers and
  seven CodeBuild projects. Reconcile the credit scope and expiry before using
  it as a budget buffer.
- Keep CodeBuild as the primary on-demand executor. The Terraform stacks already
  designate EC2 build workers as an approval-gated rollback path, yet the
  current charges show that fallback was enabled. Leave both worker-autostart
  variables false except for an incident-approved rollback; benchmark a smaller
  worker only after recording a representative cold-cache build.

### Pending cost-saving moves — 2026-08-15

- [ ] Enable payer-level Cost Explorer resource-level data, then attribute EC2
      compute and gp3 charges to individual build workers before changing their
      capacity or lifecycle.
- [ ] Confirm both EC2 worker-autostart repository variables are `false`; add
      an incident/approval reference and expiry for any temporary override.
- [ ] Add a maximum build-worker lifetime, deterministic post-build teardown,
      and an alert for any worker that exceeds the approved limit.
- [ ] Capture wall time, failure rate, cache hit rate, and cost for each EC2 and
      CodeBuild run; compare a representative cold-cache `m6i.xlarge` build
      with a smaller candidate before resizing.
- [ ] Benchmark CodeBuild Medium for development jobs and retain Large only
      where a production/native build proves it needs the capacity. Add path
      filters, concurrency cancellation, and cache reuse before reducing a
      release-critical build class.
- [ ] Review the seven CodeBuild projects and five CodePipeline pipelines for
      duplicate, retired, or no-op triggers. Consolidate only after an owner
      confirms the deployment and rollback paths remain covered.
- [ ] Keep a daily gp3-volume report and remove only owner-approved stale
      volumes after a rollback image/cache check; no active candidate was found
      during this audit.

### Security and reliability controls — 2026-08-15

- Do **not** move runtime or production secrets to GitHub. GitHub Actions
  secrets are for CI-only credentials. Infisical is the target registry for
  application secrets; AWS Secrets Manager remains the narrowly scoped bootstrap
  and compatibility path. See `.agents/pending/task-secrets-manager-cutover.md`.
- The live `us-east-1` registry contains three AWS Secrets Manager entries and
  none has automatic rotation. Both live Lambda functions still expose a broad
  set of sensitive configuration keys through environment variables. Migrate
  in small, reversible batches and validate the Infisical projection before
  removing each legacy variable.
- AWS Secrets Manager is not a meaningful cost driver: **$0.414** gross
  month-to-date, with about **$0.663** forecast for the remaining days
  (approximately **$1.08** gross for August). Its current charge is fully
  credit-offset; the self-hosted Infisical platform cost is not visible in this
  HashPass AWS account and must be reported from its hosting account instead.
- GitHub Actions uses OIDC for AWS deployment and runner control, but 20
  repository scripts still accept static AWS credential variables. Replace
  operational use with OIDC, SSO, or short-lived role credentials.
- Four active HashPass/BSL build and pipeline IAM roles have
  `AdministratorAccess`; the infrastructure deployment role also grants broad
  wildcards. Split these into per-workload, environment-scoped policies after
  observing actual API usage.
- CloudTrail, GuardDuty, and Security Hub are not enabled. Select retention and
  alert destinations before enabling them, since they add cost as well as
  security coverage.

### Build-runner finding

The target billing account does contain the mobile build runner, but it was stopped
at audit time:

- instance `i-05628f925bb57e2f1`, tagged `hashpass-mobile-release`;
- type `t3a.xlarge` (4 vCPU / 16 GiB), restored for build speed on 2026-07-28;
- launched 2026-08-04 and shut down by an explicit user/workflow action;
- its 80 GiB encrypted `gp3` root volume remains attached while stopped.

The release workflow starts this runner before a build and stops it afterward,
so compute charges are proportional to build duration rather than continuous
uptime. The attached EBS volume continues to incur storage charges while the
instance is stopped. Cost Explorer showed `t3a.xlarge`, CPU-credit, and gp3
usage types, but the queried amounts were still near zero/estimated; this is
another indication that the console forecast is either delayed or scoped to a
different account/service view.

The `default` AWS profile is a separate source account and has CodeBuild
projects, so build spend must be reconciled across both accounts before
attributing the $238.98 forecast to this runner.

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

1. Review and tighten the existing monthly AWS Budgets for total spend and the
   highest-cost services; verify alerts at 50%, 75%, 90%, and 100% of the
   approved ceiling.
2. Validate the existing Cost Anomaly monitor and subscriptions against a
   non-production test signal; route alerts to the on-call/admin channel and
   email.
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

### Immediate cost-improvement priorities

1. **Reconcile the budget view first.** Export the $80 budget, forecast,
   account/linked-account scope, and credit ledger from the same payer account;
   the current CLI and console figures disagree.
2. **Check non-target/source accounts and regions.** The target account has no
   running EC2/ECS/NAT footprint, so a $238.98 forecast is likely coming from a
   different linked account, region, service, or billing view.
3. **Inspect CloudFront, S3, CodeBuild/CodePipeline, Amplify, and data
   transfer** by service and region; these were not represented by the small
   target-account inventory above and are the most plausible remaining drivers.
4. **Keep Lambda and log retention unchanged until attribution is complete.**
   The two API Lambdas and 14-day logs are currently the only material target
   runtime footprint observed, and their measured storage is too small to
   explain the forecast alone.
5. **Set a forecast guardrail below the credit limit.** After finance confirms
   the credit scope, use alerts at 50%, 75%, 90%, and 100% of the $80 budget,
   plus a forecast alert around $60–$70 so there is time to act before the
   credit is consumed.
6. **Measure the mobile runner before resizing it.** Capture each build's
   start/stop duration and compare `t3a.xlarge` against `t3a.large` or a
   GitHub-hosted runner. A downgrade is the likely direct saving, but it may
   increase build minutes enough to erase the benefit; make it an owner-approved
   change after one representative cold-cache build.
7. **Reduce idle disk cost safely.** If the runner is rebuilt from an image or
   bootstrap script, evaluate a smaller root volume or a lifecycle that deletes
   the stopped runner's EBS volume only after preserving required caches and a
   rollback image. Do not delete the current volume during this audit.

### Safe optimization work queue

These actions may begin without changing production infrastructure:

- [ ] Verify the mobile runner's stop job runs on success, failure, and
      cancellation, and record any build minutes spent waiting for shutdown.
- [ ] Route non-production builds, tests, previews, and retry runs to
      GitHub-hosted runners where native dependencies do not require the EC2
      cache. Keep production/internal native releases on the EC2 runner until
      benchmarked.
- [ ] Run one representative cold-cache build on `t3a.xlarge` and one on
      `t3a.large`; record wall time, failure rate, CPU, memory, and resulting
      cost before approving a downgrade.
- [ ] Keep EC2 detailed monitoring disabled (`detailed_monitoring = false`);
      do not enable it solely for this audit.
- [ ] Confirm the runner can bootstrap from its AMI/user-data and restore the
      required caches before evaluating an 80 GiB-to-smaller EBS replacement.
      Preserve an image/rollback path before changing or deleting any volume.
- [ ] Configure budget alerts at 50%, 75%, 90%, and 100% of the $80 ceiling,
      plus a forecast alert around $60–$70, after confirming the payer and
      credit scope.

No runner resize, volume deletion, workflow routing change, or budget mutation
is authorized by this checklist alone; each requires the evidence and owner
approval described in the acceptance criteria below.

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
