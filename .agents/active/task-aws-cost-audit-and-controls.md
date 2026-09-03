# Task: AWS cost audit and credit protection

**Status:** ACTIVE — high priority
**Priority:** P0 (billing/credit risk)  
**Created:** 2026-08-04
**Last updated:** 2026-09-03

> The actual CodeBuild/CodePipeline → GitHub Actions migration and the
> recurring cost-monitoring workflow that grew out of this audit's CodeBuild
> findings now live in their own task doc:
> [`task-cicd-cost-optimization.md`](task-cicd-cost-optimization.md). This
> doc stays the billing/credit-risk record; that one owns the migration
> execution and phase tracking.

> **Standing rule — no EC2 provisioning without explicit owner consent.**
> This applies to Claude/agent sessions and human contributors alike, and
> covers every form EC2 provisioning could take here: restoring
> `AWS_RUNNER_ROLE_ARN`/`EC2_RUNNER_INSTANCE_ID` as repo variables, switching
> any workflow dispatch back to `runner=aws-ec2` (see
> `.github/workflows/mobile-android-release.yml`), launching a *new* EC2
> instance for any purpose, or resizing/restarting the existing stopped
> `hashpass-mobile-release` runner (`i-05628f925bb57e2f1`). If a manual
> workflow dispatch fails validation because EC2 isn't configured, the fix is
> to use `runner=github-hosted` (already the working default — see
> `CLAUDE.md`'s Mobile Android Release Workflow section) and flag it here,
> **not** to re-add the missing variables or provision new EC2 capacity ad
> hoc to unblock the dispatch. Confirmed 2026-08-15: this account is under
> active cost-audit review specifically because of prior EC2-driven spend
> risk (see the Build-runner finding below) — provisioning more EC2 capacity
> without going through Phase 3's owner-approval process would work directly
> against the purpose of this task.

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

### Trigger gap found and fixed, CodeBuild-vs-EC2 comparison — 2026-08-16

**New signal:** console MTD jumped from $35.21 (2026-08-15 audit) to $120.95
in roughly one day, forecast holding steady around $240. CLI `aws ce
get-cost-and-usage` still reconciles to near-zero on both the `hashpass`
(target) and `default` (source) profiles for the same period -- the
console/API reconciliation gap flagged 2026-08-15 remains open and
unresolved; this update relies on live resource/build-history evidence
instead, which doesn't have that lag.

**Confirmed no currently-running EC2 instance** in any of the 7 regions
with historical usage, at query time. The spike is not an EC2 leak.

**Root cause found: `hashpass-criptolatinfest-develop-site` was the only
one of 5 site-build CodePipelines with no path filter at all.** The other
four (`bsl-hashpass-dev`, `bsl-hashpass-prod`, `hashpass-dev-site`,
`hashpass-production-site`) already run CodePipeline V2 with a working
`filePaths` trigger (confirmed live via `aws codepipeline get-pipeline`,
matching the Terraform in `hashpass-web`/`bsl-target`'s `main.tf`) --
`enable_path_filtered_trigger` is a real, working, already-proven feature
in `modules/aws_static_site_pipeline`. The demo-events stack
(`stacks/demo-events/pipeline.tf`, criptolatinfest's dedicated pipeline)
simply never set it, so that one pipeline stayed on V1 with an unconditional
per-commit EventBridge trigger. Measured build history over the prior 2
days: **688.8 total build-minutes across the 5 projects**, of which
criptolatinfest alone accounted for **260.8 minutes (27 builds)** -- the
single largest contributor, all avoidable once filtered. A high-frequency
session (~10 pushes to `develop`/`main` in a few hours, each triggering a
full rebuild of every matching pipeline) is what turned an existing,
known-pending gap into a same-day spike.

**Fixed:** added `enable_path_filtered_trigger = true` plus matching
`trigger_path_includes`/`excludes` (mirroring `hashpass-dev-site`'s proven
list, trimmed to stay under AWS's 8-pattern cap) to the
`criptolatinfest_pipeline` module call. Applied via a scoped
`terraform plan`/`apply` against the isolated `demo-events` stack only (0
added, 1 changed, 0 destroyed) and confirmed live
(`pipelineType: V2, hasTrigger: true`). Expected to cut criptolatinfest's
build volume by roughly 35-40% of tonight's total going forward, since most
future commits won't touch `apps/mobile-app`/`packages/**`.

**Also checked and found already correct:** all 5 pipelines use
`executionMode: SUPERSEDED`, meaning a new push already cancels a stale
in-flight run of the same pipeline. The "add concurrency cancellation" item
in the pending list below is already satisfied -- no action needed there.

**CodeBuild-vs-EC2 comparison, requested 2026-08-16:** using the measured
688.8 build-minutes, CodeBuild's actual cost is ~$12.13 (mixed
LARGE/MEDIUM tiers) versus an estimated ~$2.20 for the same total minutes
on `m6i.xlarge` EC2 (the account's own historical instance type) -- EC2 is
genuinely ~5.5x cheaper per raw compute-minute. Recommendation is to stay
on CodeBuild anyway: matching tonight's burst concurrency (3-5 pipelines
firing within minutes of each other) would need multiple parallel EC2
workers, not one; each EC2 build pays real boot/bootstrap latency CodeBuild
doesn't; and this account has a *confirmed prior incident* of a cancelled
CodePipeline execution leaving an EC2-backed worker running indefinitely
(the "zombie worker" bug referenced above) -- a single missed stop-on-cancel
edge case in a busy week can cost more than CodeBuild's entire delta for
the month. Revisit only after observing a few days of the reduced
(correctly-filtered) CodeBuild volume, and only with the stop-on-cancel
path proven first, per the existing benchmark checklist below.

### Console/API gap explained, real root cause found — 2026-08-17

**New signal:** console showed MTD $142.39 (428% vs last month), forecast
$550.19 (961%). Same day, `aws ce get-cost-and-usage` on the `hashpass`
profile still reconciled to essentially $0 -- the 2026-08-15 reconciliation
gap looked unresolved again. It is now **fully explained, not a bug**:

- `aws budgets describe-budgets --account-id "$(aws sts get-caller-identity --profile hashpass --query Account --output text)"` returned
  `ActualSpend: $142.392` / `ForecastedSpend: $550.186` for "My Monthly Cost
  Budget" -- an exact match to the console screenshot, confirming the
  console figure is real and belongs to this account.
- The plain `get-cost-and-usage` call (no filter) nets to ~$0 because a
  **-$137.82 Credit** record is being applied against **+$137.82 of real
  Usage** for the same period -- `group-by RECORD_TYPE` shows both lines
  explicitly. The Budget's own `FilterExpression` deliberately excludes
  `Credit`/`Refund` from `ActualSpend`, which is why it (correctly) surfaces
  the real usage number while a naive CE query hides it behind the credit.
  **This is the actual explanation for the recurring "CLI shows ~$0"
  finding in every prior entry in this file (2026-08-04, 2026-08-15)** --
  not a permissions or data-lag issue as those entries speculated. Always
  add `--filter '{"Dimensions":{"Key":"RECORD_TYPE","Values":["Usage"]}}'`
  (or the Budget's own `Not(Credit,Refund)` shape) when reconciling this
  account's Cost Explorer numbers going forward.
- The credit absorbing the usage is finite (see the $200 credit noted
  2026-08-04) -- it is currently masking real spend, not eliminating it.

**Real usage MTD (Aug 1-17), `RECORD_TYPE=Usage` only, by service:**

| Service | MTD | Note |
|---|---|---|
| EC2 - Compute | $56.58 | `m6i.xlarge` $50.54 (263 hrs), `m6i.large` $3.96 (41 hrs), `t3a.xlarge` $2.08 (14 hrs, mobile-release runner) |
| CodeBuild | $49.12 | `g1.large` 1945 min ($38.90) + `g1.medium` 1022 min ($10.22) |
| EC2 - Other | $15.32 | EBS/snapshots/data-transfer tied to the above |
| CodePipeline | $7.07 | |
| S3 | $3.87 | |
| Route 53 | $2.50 | new zones from the hpass.id/hashp.link rollout |
| everything else | ~$3.4 | API Gateway, Secrets Manager, KMS, VPC, Cost Explorer itself, Lambda -- all sub-$2 each |

**EC2 Compute ($56.58) is historical, not active.** Daily breakdown shows it
concentrated **Aug 1-6** ($5-12/day), then ~$0 from Aug 7 onward. Confirmed
**zero running/pending EC2 instances** right now across us-east-1,
us-east-2, us-west-2. This lines up with the already-diagnosed "zombie
pipeline worker" bug documented under Build-runner finding above (a
cancelled CodePipeline execution doesn't stop the EC2-backed worker's
build process) -- the code-level `build_timeout_seconds` guard exists but
**only takes effect via `user_data` on instance replacement, and per that
same finding was not yet confirmed applied to the live instances** as of
this account's last check. Nothing to stop today (nothing is running), but
this remains the single highest-leverage *unresolved* fix: until the live
workers are replaced (or the guard otherwise confirmed live), any future
cancelled-mid-build pipeline run can silently re-create this exact spend
pattern with no visible symptom until the next bill.

**CodeBuild ($49.12) is real, ongoing, and mostly explained by this week's
own commit volume, not a new bug.** The 2026-08-16 path-filter fix
(criptolatinfest) is confirmed genuinely live
(`aws codepipeline get-pipeline` shows `pipelineType: V2`, a real trigger
with `filePaths.includes: [apps/mobile-app/**, packages/**, package.json,
pnpm-lock.yaml, pnpm-workspace.yaml]`) -- but criptolatinfest's build volume
barely dropped (21 builds Aug 14 -> 23 Aug 15 -> 20 Aug 16 -> 16 so far Aug
17) because that filter is **correctly** broad: criptolatinfest's demo site
is a build of `apps/mobile-app`'s web export for a specific event, so it
legitimately depends on `apps/mobile-app/**` and `packages/**` -- and this
session's own work (the hpass.id/hashpass.link/hashp.link multi-domain
rollout, the SignInModal race-condition fixes, i18n additions, several
`release:promote` cycles) touched exactly those paths dozens of times over
the same 4 days. All 5 site-build CodePipelines correctly re-trigger on
real, relevant changes -- this is real usage from a genuinely
high-commit-velocity week, not a stuck loop. Confirmed: no build is
currently hung (`aws codebuild list-builds` + `batch-get-builds` on the 5
most recent builds across all 5 projects, all `SUCCEEDED` in normal
7-12 minute durations).

**Bottom line:** the forecast risk is real (real usage pace, if it held for
the rest of the month, would land well past the $200 credit), but there is
no active leak to stop right now -- no running EC2, no stuck builds, the
one known bug (criptolatinfest's missing filter) is already fixed and
confirmed live. The two real open items are (1) confirm/apply the
`build_timeout_seconds` guard to the live pipeline EC2 workers so a
cancelled build can't silently re-create the Aug 1-6 pattern, and (2)
expect CodeBuild spend to fall back down once this session's unusually
high commit/release cadence returns to normal -- track actual MTD via
`aws budgets describe-budgets --account-id "$(aws sts get-caller-identity --profile hashpass --query Account --output text)"`, not a plain
`ce get-cost-and-usage`, to avoid re-triggering this same false alarm.

### Feature scoped, not implemented: per-commit skip flag for site-build pipelines — 2026-08-18

**Trigger:** a real, unrelated SDK-publish session's `develop` push (the
`@hashpass-tech/sdk` npm rename + workspace-to-published migration commits)
fired `hashpass-dev-site`, `bsl-hashpass-dev`, and
`hashpass-criptolatinfest-develop-site` simultaneously. **Verified this was
correct, not a bug**: all three pipelines' Terraform-defined `file_paths`
trigger filters (the 2026-08-16 fix above) already include
`apps/mobile-app/**`, `packages/**`, `package.json`, `pnpm-lock.yaml` —
exactly what that commit touched (it renamed a package `apps/mobile-app`
imports and regenerated the lockfile). Confirmed by reading the actual
`site_trigger_includes`/`bsl_trigger_includes` locals in
`stacks/hashpass-web/main.tf` and `stacks/bsl-target/main.tf` directly, not
just AWS console evidence.

**The real ask, distinct from the path-filter work above:** a way to mark a
specific commit as not needing a rebuild even though it touches a normally-
watched path — e.g. a pure rename/refactor with no output-affecting change
(this session's own SDK rename is exactly that case: `apps/mobile-app`'s
compiled bundle is unaffected by an npm package's name changing, only its
`package.json`/lockfile references do). Path-based filtering fundamentally
cannot express this distinction; it needs either a commit-message marker or
equivalent human/agent-asserted signal.

**Why not implemented in this same session:** AWS CodePipeline's native
`CodeStarSourceConnection` push trigger only supports branch and
`file_paths` include/exclude glob filters — there is no commit-message or
other content-based filtering capability in the trigger itself. Closing
this gap needs a real architecture change, not a Terraform variable tweak,
and touches live production pipeline Terraform in three separate stacks
(`hashpass-web`, `bsl-target`, `demo-events`) — scoping it properly here
rather than rushing a same-session change to production CI/CD trigger
mechanics.

**Two viable designs, not yet chosen between:**

1. **Move to GitHub-Actions-mediated triggering** (mirrors the existing,
   proven pattern in `.github/workflows/mobile-release-on-tag.yml`'s
   `detect-mobile-native-change.js` gate exactly): disable each pipeline's
   native `trigger { git_configuration { push { ... } } }` block, add a
   GitHub Actions job on `develop`/`main` push that checks the commit
   message for a skip marker (e.g. `[skip-aws-ci]`) and conditionally calls
   `aws codepipeline start-pipeline-execution` per affected pipeline only
   when not skipped. Clean (zero wasted spend on skipped commits), consistent
   with an already-trusted pattern in this repo, but requires rewiring the
   trigger mechanism itself on all three stacks, which needs care not to
   create a window where neither the old nor new trigger is active.
2. **Stop-after-start**: leave the native triggers exactly as they are, add
   a small Lambda + EventBridge rule (per stack, or one shared one watching
   all three pipelines) that reacts to a pipeline entering `InProgress`,
   checks the triggering commit's message via the GitHub API, and calls
   `stop-pipeline-execution` immediately if the skip marker is present.
   Less invasive to the existing, working trigger config, but wastes a
   small amount of setup/checkout time per skipped run (not full build
   minutes) and needs new Lambda infra in three places instead of a
   GitHub Actions job.

Recommendation when this is picked up: Option 1, for consistency with the
mobile-release precedent and zero wasted spend — but confirm with whoever
implements it, since Option 2 is meaningfully less invasive to touch if the
native trigger's current reliability is valued over the marginal spend of
a stop-after-start round trip.

**Not authorized by this entry alone** — matches this task's own acceptance
criteria below: any actual trigger-mechanism change to `hashpass-web`,
`bsl-target`, or `demo-events` needs a scoped `terraform plan`/`apply` per
stack with room to verify each one individually, the same way the
2026-08-16 criptolatinfest fix was applied.

### Current cost and resource reconciliation — 2026-08-24

**Scope corrected:** all figures in this section use the configured
`hashpass` profile, payer account `952191196420`. The shell's `default`
profile is a separate source/shared account (`058264267235`) and must not be
used to assess HashPass spend. Cost Explorer data is estimated and covers
2026-08-01 through 2026-08-24. To expose real consumption in this credited
account, every Cost Explorer usage query filters to
`RECORD_TYPE=Usage`; the unfiltered total hides spend behind credit records.

| August MTD financial position | USD | Evidence |
|---|---:|---|
| Gross usage | $179.468 | Cost Explorer, `RECORD_TYPE=Usage` |
| Credit applied | -$142.510 | Cost Explorer, `RECORD_TYPE=Credit` |
| Net unblended cost so far | $36.958 | Gross usage less credit applied |
| Remaining-August gross forecast | $24.207 | Cost Explorer forecast, Aug 25–31 |
| Gross month-end forecast | $203.675 | `My Monthly Cost Budget` |
| Monthly gross budget | $80.00 | `My Monthly Cost Budget` |

The forecast is **$123.68 / 155% over** the approved monthly ceiling. The
previous $200-credit figure and any remaining balance/expiry are still not
verified by a payer-console credit export; do not infer a remaining credit
balance from the applied-credit line above. At the current $203.675 gross
forecast, a $200 credit would be insufficient even if it applied to every
charge, but its scope and terms remain an owner action.

**Gross MTD service drivers (top six = $175.41 / 97.7% of usage):**

| Service | Gross MTD | Primary cost evidence | Optimization posture |
|---|---:|---|---|
| CodeBuild | $81.90 | `g1.large` $67.04; `g1.medium` $14.86 | Highest current controllable driver; benchmark before resizing and reduce avoidable executions. |
| EC2 Compute | $56.58 | `m6i.xlarge` $50.54; `m6i.large` $3.96; `t3a.xlarge` $2.08 plus $0.16 CPU credits | Historical worker usage; keep EC2 fallback approval-gated. |
| EC2 - Other | $15.32 | $12.41 gp3 in us-east-2 and $2.69 gp3 in us-east-1 | Historical worker-disk spend; no live volume is present to delete. |
| CodePipeline | $11.31 | $10.31 V2 action-execution minutes, $1 active-pipeline fee | Retire only owner-approved obsolete pipelines; preserve release paths. |
| S3 | $6.23 | $4.58 us-east-2 timed storage; $1.66 request tiers | Inspect artifact retention/lifecycle before deletion. |
| Route 53 | $4.06 | $4 hosted zones, $0.06 DNS queries | Validate every zone is still required; DNS query cost is immaterial. |

**Recent trend:** the Aug 18 $14.77 daily spike included $11.34 of CodeBuild;
Aug 19 included $3.56 of CodeBuild. Daily usage then fell to about $0.31 on
Aug 20–23 before Aug 24's $2.70, including $2.01 of CodeBuild. This confirms
that build execution volume, rather than a continuously running runtime
resource, is the practical lever after the historical EC2 spend.

**Live setup checked read-only:**

- No running, pending, or stopped EC2 instance; no EBS volume; no NAT gateway;
  no unattached Elastic IP; and no RDS instance was returned in `us-east-1`
  or `us-east-2` (and no running/pending EC2, NAT, unattached IP, or RDS in
  `us-west-2`). There is no live worker or orphaned disk to stop/delete.
- Five production/development deployment pipelines are present and V2:
  `hashpass-dev-site`, `hashpass-production-site`,
  `hashpass-criptolatinfest-develop-site`, `bsl-hashpass-dev`, and
  `bsl-hashpass-prod`.
- The five product CodeBuild projects remain: four `BUILD_GENERAL1_LARGE`
  projects (the three HashPass site builds plus BSL production) and one
  `BUILD_GENERAL1_MEDIUM` BSL development project. The three HashPass site
  projects use `NO_CACHE`; BSL projects use an S3 cache. Two 15-minute probe
  projects (`hashpass-arm-probe-*` and `hashpass-lambda-probe-*`) also remain
  and should be time-bounded/removed once their experiment owner confirms
  they are no longer needed.
- Lambda, API Gateway, CloudFront, Secrets Manager, and data transfer are
  collectively small contributors; do not trade runtime reliability for
  negligible savings while the build drivers dominate.

**Controls and audit gaps:**

- The overall $80 budget already alerts on actual 50%, 75%, 85%, 90%, and
  100%, and forecast 80% and 100%. The EC2-compute budget ($25) alerts on
  actual 50%, 75%, and 90%, and forecast 80% and 100%. The overall budget's
  $179.468 actual and $203.675 forecast confirm the threshold controls did
  not constrain execution volume; verify notification destinations and add a
  credit-burn/CodeBuild-specific response runbook rather than duplicating
  thresholds.
- Cost Anomaly Detection has a default daily service monitor plus an immediate
  HashPass subscription at $5. Validate that both reach an accountable owner.
- Cost Optimization Hub is not enrolled and EC2 rightsizing recommendations
  are not enabled in Cost Explorer. Enroll/enable them after confirming the
  payer preference; no recommendation was available for this audit.
- Payer-level resource-level cost data and active cost-allocation tags are
  still needed to attribute future build spend per worker/pipeline. Do not use
  the shared-account `default` profile as a substitute for that attribution.

**Updated priority order:**

1. Obtain a Billing → Credits export (credit ID, eligible services, balance,
   and expiry) and verify the budget/anomaly recipients; this is the only
   blocker to a reliable net-cost and credit-burn forecast.
2. Keep EC2 autostart disabled and complete the existing live-timeout/cleanup
   verification before any incident-approved EC2 rollback. There is no
   currently active EC2 resource to remediate.
3. Make CodeBuild reduction the next approved change: audit the three
   no-cache large site projects, add/reuse caching where reproducible, and
   benchmark Medium only for development workloads. Preserve the proven path
   filters and `SUPERSEDED` execution mode; do not lower production capacity
   without a representative cold-cache build and rollback result.
4. Review the five pipelines and two probes for ownership and last-use. Apply
   S3 artifact/log lifecycle changes only after a documented rollback and
   release-retention check.

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
