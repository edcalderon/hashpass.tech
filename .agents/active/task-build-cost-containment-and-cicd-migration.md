# Task: Critical build-cost containment and CI/CD migration

**Status:** LIVE CONTAINMENT COMPLETE — promotion and cost observation pending
**Priority:** P0 — September has exceeded the hard $50/month production ceiling
**Created:** 2026-09-04
**Last updated:** 2026-09-21
**Owner:** HASHPASS production owner; approval is required for every AWS
mutation or production cutover.

This is the single execution tracker for reducing AWS build cost. It
supersedes the implementation work in
[`task-cicd-cost-optimization.md`](task-cicd-cost-optimization.md) and the
exploration in
[`../pending/task-build-system-cost-and-speed.md`](../pending/task-build-system-cost-and-speed.md).
The separate
[`task-aws-cost-audit-and-controls.md`](task-aws-cost-audit-and-controls.md)
remains the canonical billing, credit, and no-EC2-provisioning record.

## Current containment — 2026-09-21

Read-only checkpoint: **2026-09-21 15:16 UTC**. All five pipelines returned
manual-only source configuration and **zero active executions**. The $50 budget
still returned $57.548 actual / $172.772 forecast and five notification rules.

The owner requested immediate build-cost reduction and maximum use of standard
GitHub-hosted compute. The private `AWS_TARGET_ACCOUNT_ID` matches the `hashpass`
STS identity. The repository-level `AWS_ACCOUNT_ID` differs; it belongs to the
older infrastructure workflow configuration and must not be used as proof of
the production account identity or changed without auditing its consumers.

- Budget actual: **$57.548**; forecast: **$172.772**; approved ceiling: **$50**.
  September is already **$7.548 over budget** and cannot be brought back under
  the ceiling by reducing future usage. Forecasts lag operational changes.
- Cost Explorer Sep 1–21, estimated UnblendedCost excluding Credits/Refunds:
  CodeBuild **$43.47**, CodePipeline **$5.496**, Route 53 **$4.052**, S3
  **$3.174**, Secrets Manager **$0.795**, other services **$0.561**.
  Build services account for about **85%** of the total.
- No EC2 instances exist in the two relevant regions (`us-east-1`, `us-east-2`).
- The development GitHub workflow is active. As checked, it had 21 successful
  runs since Sep 4, plus superseded/cancelled builds and three earlier failures.
  The observed build+deploy run **35610166639** passed on Sep 21; the next run
  **35611630715** also succeeded. The development site returns HTTP 200 and the
  API reported **1.9.46** at cutover. This is the recorded cutover evidence,
  not a claim that later development deployments remain on that version.
- **LIVE:** `hashpass-dev-site` is now manual-only: the V2 triggers are removed
  and the CodeConnections source explicitly has `DetectChanges=false`.
  The pipeline/project and manual recovery script remain available. A private
  pre-change pipeline snapshot was retained locally for rollback. The Terraform
  variable default now also records the manual-only posture; no broad apply of
  the drift-affected `hashpass-web` stack was performed.
- **LIVE:** CBWeek development and BSL development also completed their
  cutover in GitHub run **35613663531** (commit `3c6489b87`). Both builds and
  deployments succeeded. Downloaded artifact `index.html` bytes match both the
  deployed S3 objects and public CDN responses; both sites return HTTP 200.
  No old AWS executions were active at cutover. Their V2 triggers are removed,
  `DetectChanges=false`, and there are no EventBridge targets for either
  pipeline. This emergency containment uses observed deployment/parity evidence
  immediately; the longer observation period continues with manual recovery
  available, rather than paying for both systems on every push.
- **LIVE:** core production and BSL production completed their cutover in
  GitHub run **35615317532** on protected merge `de2bed5e4` (v1.9.46). All
  build/deploy jobs passed. Each downloaded artifact's `index.html` matches
  both S3 and the public CDN response (HTTP 200); the production API reports
  **1.9.46**. Both old AWS executions had finished before cutover. Both
  pipelines now have no V2 triggers, `DetectChanges=false`, and no EventBridge
  targets. Private rollback snapshots were retained. **All five targets now
  use GitHub-hosted builds; all five AWS pipelines are manual recovery only.**
  New `.github/workflows/github-hosted-tenant-site-deploy.yml` preserves each
  target's public build configuration, builds without AWS credentials, retains
  artifacts for one day, and serializes deployments. Production targets require
  `main`; development targets require `develop`. Manual trials default to build
  only. Do not disable an AWS target based only on a successful build.
- Separate deployment roles are described by
  `packages/infra/cloudformation/github-site-deploy.yml`, one isolated stack per
  target. Each can write only its own site bucket, invalidate its own
  distribution where applicable, and update only its own API code where needed.
  No role can start EC2, CodeBuild, or CodePipeline, or change Lambda settings.
  Existing BSL cross-account CloudFront delivery remains unchanged.
- **Separate legacy path:** `.github/workflows/infra-deploy.yml` is still active
  and has its own `main`/`develop` push filters. It attempts legacy SST/API
  deployment on GitHub runners; it is not one of the five disabled AWS
  CodePipeline sources. Auditing or retiring this overlapping deployment path
  remains separate work, not a completed part of the cutover.
- **LIVE:** all four separate IAM-role stacks are `CREATE_COMPLETE`; each
  GitHub environment permits only its intended branch. No Terraform apply was
  performed against an existing serving stack.
- **LIVE:** the $50 budget previously had **zero notifications**, while the
  legacy $80 budget had seven. Added actual 50/75/90/100% and forecast 100%
  alerts, reusing the existing billing email subscriber without exposing its
  address. Rules/subscribers were verified; delivery itself was not simulated.
- Added `.github/workflows/aws-cost-report.yml` and the narrowly scoped
  `hashpass-github-cost-report` IAM role. It performs one Cost Explorer query
  per daily run, reports the existing $50 budget's actual/forecast values, and
  detects re-enabled automatic triggers for all five migrated pipelines.
  Cost and trigger observations are read-only; the role may only additionally
  read/write one encrypted private SSM alert-state parameter so an already
  breached budget sends its first alert immediately and repeats only after a
  USD 5 actual-spend or forecast movement. Trigger drift still fails visibly.
  The daily schedule becomes active when the workflow reaches `main`; its
  `develop` push trigger provides hosted verification. Latest verified run
  [35617295918](https://github.com/hashpass-tech/hashpass.tech/actions/runs/35617295918)
  checked the account-scoped read-only role, live billing, and **all five**
  manual-only pipelines. Its failure is solely the expected **budget alert**,
  not trigger drift or a deployment error: $57.55 actual / $172.77 forecast.
  The guard defaults to all five if the repository variable is absent.

### Current release and handoff

- **Deployed:** v1.9.46, protected merge `de2bed5e4` from PR #248. The production
  replacement workflow is already on `main` and its deployment was verified.
- **Prepared, not released:** v1.9.47 in
  [PR #249](https://github.com/hashpass-tech/hashpass.tech/pull/249), release
  commit `b5d52685a`. It carries the manual-only Terraform defaults, regression
  tests, and daily cost guard. Both remotes' `develop` branches were pushed;
  their `main` branches remain at v1.9.46. This is intentionally pending, not a
  completed release.
- **PR checkpoint, 2026-09-21:** open, review required; Gitleaks and CodeQL
  passed. One scanner-download failure passed on retry without changing the
  security gate. Coverage and build/deployment checks were still running;
  verify the latest PR checks before merge rather than relying on this snapshot.
- **Schedule pending:** the daily guard is defined for **13:20 UTC / 08:20
  Colombia time**, but is not scheduled until it reaches the default branch.
  The AWS budget email rules are already live independently of this schedule.

| Target | GitHub source branch | Retained manual AWS pipeline |
|---|---|---|
| Core development | `develop` | `hashpass-dev-site` |
| CBWeek development | `develop` | `hashpass-cbweek2026-develop-site` |
| BSL development | `develop` | `bsl-hashpass-dev` |
| Core production | `main` | `hashpass-production-site` |
| BSL production | `main` | `bsl-hashpass-prod` |

Remaining work:

1. Obtain the required owner approval and passing coverage/security gates for
   PR #249; complete the normal protected release automation and verify branch
   synchronization and deployment/version checks. Do not manually tag or
   duplicate the tag-triggered Android workflow.
2. Verify the first default-branch scheduled cost report after merge. A red
   report remains expected while actual or forecast exceeds $50; inspect the
   report to distinguish the budget alert from trigger drift or an AWS error.
3. Observe subsequent billing ingestion and per-target build execution history.
   Establish the post-cutover daily spend rate before claiming realized savings.
   Accrued charges and forecasts can lag; September cannot return below $50.
4. Schedule the owner-approved recovery drill separately. Preserve the retained
   pipelines/projects and private rollback snapshots; do not run paid builds
   merely to silence a budget alert or delete recovery resources now.
5. Audit the separate legacy `infra-deploy.yml` workflow and its account-scoped
   permissions before proposing retirement; do not disable it based only on
   the five CodePipeline trigger checks.

Validation: credentialless build/branch routing and environment-input rejection
checks passed; **38 tests in five infrastructure suites** cover account
boundaries, budget alerts, pipeline drift, target routing, and public-config
injection rejection; `hashpass-web` and `bsl-target` Terraform validation passed.
`demo-events` validation is blocked by
the installed Terraform 1.6.6 not supporting its existing `removed` blocks (not
introduced here). Repository-wide lint reports 12 existing application errors;
the cost-control change does not modify those application files.

## Historical verified state — 2026-09-04

Read-only AWS checks using the `hashpass` production profile found:

| Signal | Value | Metric / interpretation |
|---|---:|---|
| Budget actual | $26.096 | Budget `UnblendedCost`, credits/refunds excluded |
| Budget forecast | $383.252 | Same budget metric; estimated, not an invoice |
| Hard ceiling remaining | $23.904 | $50.00 minus budget actual; about $0.92/day for Sep 5–30 |
| CodeBuild | $18.45 | Cost Explorer estimated `UnblendedCost`: 787 Large minutes/$15.74 + 271 Medium minutes/$2.71 |
| CodePipeline | $2.19 | Cost Explorer estimated `UnblendedCost` |
| CBWeek dev pipeline | 31 executions | Sep 2–4: 28 succeeded, 2 failed, 1 stopped; every execution was a `develop` webhook push |

The dominant controllable cost is build execution. `hashpass-cbweek2026-develop-site`
uses a Large CodeBuild job and its buildspec deploys directly to its S3/
CloudFront development target. Its automatic trigger is therefore a live
deployment path, not disposable CI. Historical reports in the AWS audit use
gross `RECORD_TYPE=Usage` to assess credit burn; do not compare those values to
the budget card without stating the record-type and credit treatment.

The repository is public. Standard GitHub-hosted Linux runners are therefore
the preferred build executor: the current `ubuntu-latest` capacity is 4 vCPU /
16 GB and is free for public repositories. This is a validated pricing and
capacity premise, but every site target still requires its own artifact-parity
and deployment trial. Do not use larger GitHub runners, new EC2 workers,
external hosted builders, or self-hosted runners for this objective.

### Development trial progress — 2026-09-04

- [x] A clean, credentialless equivalent of the manual GitHub-hosted
      development build completed with the existing `build-static-site.sh` and
      produced `dist/client` (34 MB). This validates artifact generation, not
      a deployment.
- [x] Added a manual, build-only-by-default workflow at
      `.github/workflows/github-hosted-static-site-deploy.yml`. Its build job
      has no AWS credential permission; development deployment is a separate,
      opt-in job. The workflow does not offer a production deployment yet.
- [x] Added Actions-native visibility: each run writes its commit, run URL,
      outcome, duration, artifact byte size, and artifact checksum to the job
      summary, then retains structured build/deployment evidence artifacts for
      14 days. The read-only
      `inspect-github-hosted-static-site-deploy.sh` command lists recent runs.
- [x] Isolated build-only trials from deployment concurrency. Development
      deployments now serialize instead of cancelling an active S3/Lambda
      update, so a later build-only dispatch cannot leave a partial deployment.
- [x] Added a Terraform definition for a **development-only** GitHub OIDC
      role. Its subject is restricted to the `development` GitHub environment
      and its policy is restricted to the development site bucket, CloudFront
      distribution, and API Lambda. It has no EC2 or CodePipeline permissions.
      **Applied 2026-09-04** via a `-target`-scoped, owner-reviewed plan
      (`plan: 2 to add, 0 to change, 0 to destroy`) — see
      `apps/docs/docs/infra/hashpass-api-target-terraform-env-drift.md` for
      the override values required to get a truthful plan on this stack.
      Role ARN: `arn:aws:iam::<account>:role/hashpass-development-static-site-github-actions`.
- [x] The workflow is registered on the default branch and was dispatched
      successfully from `main` (`workflow_dispatch`, both build-only and
      build+deploy runs).
- [x] The status command was exercised against GitHub and correctly reports
      the expected pre-promotion state: the workflow is not registered on the
      default branch, so no hosted run has occurred. (Superseded — the
      workflow is now on the default branch and has real run history.)
- [x] AWS role applied; `development` GitHub environment created
      (branch-restricted to `main`/`develop`);
      `AWS_STATIC_SITE_DEPLOY_ROLE_ARN` set on that environment. No production
      resource touched. `hashpass-web`'s documented Terraform drift was
      avoided by using `-target` plus the explicit variable overrides from
      the drift doc, not a blind plan/apply.

At the September 4 trial, production was explicitly out of scope until
development passed. Production subsequently passed its own September 21 gates
as recorded above. The original gate required a
separate least-privilege role, a protected `production` GitHub environment,
a scoped reviewed infrastructure change, an observed deployment, a rollback
path, and an observation window. The final cutover used isolated IAM stacks
and narrow pipeline API updates, not a broad serving-stack Terraform apply.
A development role must never be reused for production.

### Recovery design — GitHub-hosted primary, AWS break-glass fallback

The public site and API remain available during a GitHub Actions outage because
they are already served from AWS; build-system availability is a separate SLO.
The retained AWS development pipeline is the recovery path, but it must not
also automatically build every source push once GitHub Actions is primary.

- [x] Added `start-web-pipeline-disaster-recovery.sh`, a guarded operator
      command that requires the intended environment, full commit SHA, incident
      reference, private expected AWS account ID, and an explicit `--execute`.
      It checks that no pipeline execution is active and starts the exact source
      revision only after the normal AWS source trigger is disabled. Each
      attempt adds a fresh random nonce to CodePipeline's idempotency token, so
      a retry of a stopped or failed pinned revision starts a new execution.
- [x] Added Terraform support for manual-only retained development recovery:
      it sets `DetectChanges = false` **and removes the V2 webhook trigger**.
      The September 21 follow-up defaults all five migrated targets to manual
      recovery; those defaults await PR #249 promotion, while live AWS trigger
      containment is already verified.
- [x] Add an independent availability monitor/alert for GitHub Actions and
      record the owner/on-call route. The monitor may alert on sustained loss
      of Actions availability; it must not automatically start AWS builds.
      **Added 2026-09-04**: `.github/workflows/github-outage-monitor.yml`
      (detect-and-alert only, does not call the recovery script) — polls
      githubstatus.com's Actions component every 15 min and opens/updates a
      `github-outage-alert`-labeled issue with the break-glass command
      template on a real, non-`unknown` indicator; auto-closes when it
      clears. Watched-workflow-run failures are reported for context but are
      explicitly not a trigger by themselves, to avoid false-positiving on an
      ordinary broken commit. Full design and self-detection limitation:
      `apps/docs/docs/infra/github-outage-monitor.md`. Opened for review as
      PR #234, now merged; unlike the new daily cost guard, this outage monitor
      is already on the default branch. It is not an automatic AWS failover.
- [ ] Exercise the development recovery command in a scheduled, owner-approved
      drill after the AWS source trigger is disabled. Verify the pinned revision,
      public site, CloudFront invalidation, API-version guard, and rollback.

Do not auto-fail over on a single GitHub Actions failure: that can run two
deployments for one revision and recreate the CodeBuild cost spike. An Actions
outage where GitHub source delivery still works can use the AWS fallback. If
GitHub itself or CodeConnections cannot fetch the requested source revision,
the safe response is to keep the already deployed version serving; a new build
cannot be recovered without a separately maintained source mirror.

## Decision: optimize execution path first, not patch size

Do **not** accumulate large risky patches merely to ship less often. Keep small,
reviewable PRs and run lightweight validation on every PR. Separate that from
deployment:

1. PRs run path-filtered lint, typecheck, and tests on GitHub-hosted runners;
   they receive no AWS credentials and never deploy.
2. The development deployment workflow runs only after a validated merge to
   `develop`, with exact build-input path filters and a per-environment
   deployment concurrency group. Deployments serialize with
   `cancel-in-progress: false` so no later run can interrupt an active
   S3/Lambda update; build-only trials use no deployment concurrency group.
3. Production deploys remain protected release/tag events, never normal PR or
   `develop` pushes. Security fixes keep their expedited path.
4. If deployment frequency still needs an operational cap, use an explicit
   owner-approved deployment window/manual dispatch of the latest protected
   commit—not bigger PRs and not a hidden cron that can ship an unreviewed
   revision.

This changes expensive AWS deployment work from “every matching push” to “the
latest approved deployable revision,” while preserving rapid, low-cost CI
feedback.

## Ordered containment plan

### 0. Daily evidence and budget guard — IN PROGRESS

- [x] Reconcile the current production budget, forecast, primary services, and
      high-frequency CBWeek executions.
- [ ] Record daily budget actual/forecast, CodeBuild minutes/cost, and
      CodePipeline cost after cutover. The hosted guard reports service costs
      and budget values; build minutes require separate usage/history evidence.
      The owner has already been warned that September exceeds the ceiling.
- [x] Restore and verify the $50 budget's five notification rules using the
      existing billing recipient. Delivery has not been simulated.
- [ ] Verify anomaly-alert delivery and obtain the Billing → Credits export
      (credit scope, remaining balance, and expiry). Budgets alert; they do not
      stop builds.
- [ ] Merge PR #249 and verify the daily cost guard's scheduled execution.

### 1. Immediate execution containment — COMPLETE, 2026-09-21

- [x] Map the CBWeek development deploy's required availability and rollback
      expectation, then prepare a reversible change that removes or gates its
      automatic `develop` webhook. Preserve a manual/dedicated-branch rollback
      path. Do not disable it before its replacement succeeds.
- [x] Inspect the other four build targets' executions and identify the
      highest-minute non-production target next. Do not blanket-disable
      production paths.
- [x] Do not manually rerun CodePipeline/CodeBuild jobs while containment is
      active unless needed to restore a verified service.

### 2. GitHub Actions replacement — preferred solution

- [x] Add a `workflow_dispatch`-only, build-only GitHub Actions trial for the
      first development site on `ubuntu-latest`; build with the existing
      `build-static-site.sh` and upload `dist/client`.
- [x] Compare artifact output and memory feasibility with the existing build:
      the clean equivalent build produced a 34 MB artifact successfully. Run
      the hosted workflow after normal protected promotion to record hosted-job
      duration and artifact parity before a deploy is allowed.
- [x] Define a narrowly scoped, separate development OIDC deploy role/policy
      for the development bucket, CloudFront distribution, and Lambda only.
      **Applied 2026-09-04.** PR workflows stay credentialless; only a
      `development` environment deployment job can assume it.
- [x] Before an AWS apply or setting `AWS_STATIC_SITE_DEPLOY_ROLE_ARN`, create
      the `development` GitHub environment, scope that variable to it, and
      restrict deployment branches to the intended protected source branch.
      The OIDC subject restriction is environment-specific, not branch-specific.
      Done 2026-09-04: `development` environment created, branch-restricted to
      `main`/`develop`, `AWS_STATIC_SITE_DEPLOY_ROLE_ARN` set on it.
- [x] Show the complete `hashpass-web` Terraform plan to the owner and obtain
      explicit, real-time approval immediately before apply. The additive role
      source does not bypass this stack's false-drift guard. Done 2026-09-04
      via a `-target`-scoped plan (2 to add, 0 to change, 0 to destroy),
      shown and approved before `terraform apply`.
- [x] Run one observed manual development deploy; verify the public site,
      CloudFront invalidation, and API-version guard before enabling any
      automatic trigger. This deployment updates both the development site and
      its API Lambda artifact; it is not a static-files-only operation.
      First attempt 2026-09-04 (`workflow_dispatch`, run 33899558488):
      static-site build/S3-sync/CloudFront-invalidation succeeded, but the
      Lambda packaging step failed — `package-lambda.sh` prefers
      `dist/server` (expo export's server output, where Better Auth's
      `[...auth]+api` route and other API routes live) and only falls back
      to `dist/client` when `dist/server` is absent; the workflow's
      build→deploy artifact hand-off only carried `dist/client`, so the
      deploy job silently packaged a client-only export with no API routes
      at all. Fixed in the same PR (#234) by uploading/downloading the
      whole `dist/` directory instead of `dist/client` alone. Re-dispatched
      from the fix branch (run 33901760548) to validate before merge — build
      job succeeded (confirms the artifact hand-off now carries `dist/server`),
      but the deploy job failed instantly with zero steps executed. Root
      cause was unrelated to the fix itself: the `development` GitHub
      environment has a `deployment_branch_policy` restricting deploys to
      `develop`/`main` only, so GitHub refused to start the deploy job at
      all from a PR branch — this workflow can never be validated end-to-end
      pre-merge via `workflow_dispatch` on a feature branch, only after
      merging to `develop` (or `main`). Also fixed two unrelated real bugs
      an automated PR review bot found on `github-outage-monitor.yml` in the
      same PR: the healthy-indicator comparison read the githubstatus.com
      Actions component's per-component `.status` (`operational`) but
      compared it against `"none"` (only ever a top-level-only value),
      making `should_alert` always `true` and permanently defeating
      auto-close; and several `${{ }}` step outputs (incident JSON, run
      report) were interpolated directly into a `run:` block's shell text
      instead of via `env:`, a script-injection risk from an apostrophe in
      an incident name. Both fixed and merged in PR #234 (merge commit
      `1982708a2`), and `origin/develop` fast-forwarded to match.
      Re-dispatched on `develop` post-merge (run 33904472746) for the real
      end-to-end validation, since `develop` satisfies the environment
      branch policy: build succeeded, deploy succeeded (all steps green,
      including "Deploy the verified static site" which performs the
      S3 sync and CloudFront invalidation). Independently confirmed live:
      `https://dev.hashpass.tech` returns HTTP 200, and
      `https://api-dev.hashpass.tech/api/config/versions` returns real,
      current version JSON (`currentVersion: "1.9.35"`) rather than a 404 —
      proof the Lambda now has the API routes (`dist/server`) live, not a
      client-only export. This item is fully done.
- [x] **2026-09-05**: `github-hosted-static-site-deploy.yml` now triggers
      automatically on `push` to `develop`, path-filtered to mirror
      `local.site_trigger_includes` in
      `packages/infra/terraform/stacks/hashpass-web/main.tf` (the AWS
      pipeline's own include list — GitHub Actions can't combine `paths` with
      `paths-ignore`, so the AWS side's narrower excludes aren't mirrored;
      free runners make an occasional extra build costless). The `build` job
      got its own `cancel-in-progress: true` concurrency group keyed on
      `github.ref` so a rapid follow-up push cancels a stale in-flight build;
      the `deploy` job's existing serialized
      `static-site-deploy-development` / `cancel-in-progress: false` group is
      unchanged. The `deploy` job now also fires automatically on `push` (not
      only on a manual `deploy=true` dispatch), so an automatic `develop`
      push does a real build+deploy — this is what makes it the actual
      continuously-exercised primary instead of a workflow only exercised by
      hand. Both jobs' evidence JSON/step summaries now record
      `github.event_name` so push-triggered runs are distinguishable from
      manual ones in history.
      **Deliberately NOT done in this change**: `dev_aws_pipeline_source_detect_changes`
      is untouched (still `true` — confirmed live via
      `aws codepipeline list-pipeline-executions --pipeline-name
      hashpass-dev-site`, which shows it still auto-triggering on every
      relevant `develop` push). The AWS pipeline is intentionally left running
      in parallel as the documented rollback for an observation window before
      anyone flips that variable — that Terraform apply is a separate,
      explicit, owner-approved step, not part of this PR.
      **Superseded on 2026-09-21:** the observation-only phase ended with the
      verified cutover above; the live source is now manual-only. Do not restore
      `true` from this historical entry.

### 3. Automatic AWS build execution — COMPLETE; observation ongoing

- [x] Disable all five automatic sources after their successful replacement
      deployments and artifact/public-response verification. The owner's
      September 21 containment request superseded the extended period of
      duplicate paid execution; longer observation continues with manual
      recovery retained.
- [x] Migrate core development, CBWeek development, BSL development, core
      production, and BSL production. Per-target evidence is recorded above.
- [x] Keep EC2 unprovisioned and disabled. The historical EC2 comparison is
      archived evidence only, not authorization to start a benchmark.
- [ ] Observe near-zero normal AWS build execution after billing ingestion.
      Do not delete the retained recovery resources as part of this cutover.

### 4. Secondary savings — deferred, not required for containment

Normal builds now use standard GitHub-hosted compute. Do not spend on AWS
benchmark builds or perform a drift-prone Terraform apply to optimize idle
fallback capacity. Revisit these only if owner-approved recovery usage justifies it.

- [ ] Apply/verify S3 dependency caching only where the Terraform stack can be
      planned safely. `hashpass-web` has documented false drift: no blind apply
      is allowed.
- [ ] Benchmark Medium only for development work, using the same representative
      cold and warm cache commits and a documented rollback. Do not resize
      production from list pricing alone.
- [ ] Tighten path filters only from the actual dependency graph; broad shared
      `packages/**` is not evidence that a package is safe to exclude.

## Exit criteria

- [x] Notify the owner that September already exceeds $50 and accrued charges
      cannot be reversed. Do not represent alerts as a hard spending cap.
- [ ] Daily post-cutover evidence supports a sustainable future monthly run
      rate within $50; September's already-breached total is not a valid target.
- [x] Verify each replacement deployment and artifact, including the core API
      version guards, before disabling its automatic AWS trigger.
- [ ] Exercise the retained manual recovery path in an owner-approved drill.
- [ ] Each migrated target has an independent observation period with its
      CodeBuild minutes near zero before the AWS resources are retired.
- [x] No new EC2, external build vendor, or self-hosted runner was introduced.
- [x] Preserve scoped cutover evidence and private rollback snapshots; no broad
      Terraform apply was performed against the drift-affected serving stacks.
- [ ] Complete PR #249 promotion and confirm the daily scheduled guard.

## References

- GitHub Actions' standard hosted runners are free for public repositories and
  `ubuntu-latest` provides 4 vCPU / 16 GB:
  <https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job>
- GitHub concurrency can cancel an in-progress deployment when a newer revision
  arrives:
  <https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency>
- AWS CodePipeline supports branch and file-path trigger filters, but filters
  alone do not solve a high rate of relevant `develop` pushes:
  <https://docs.aws.amazon.com/codepipeline/latest/userguide/pipelines-filter.html>
- For CodeConnections pipelines, manual-only recovery requires both no V2
  trigger and `DetectChanges = false`:
  <https://docs.aws.amazon.com/codepipeline/latest/userguide/connections-github.html>
- CodePipeline can start a manually selected source revision with
  `start-pipeline-execution --source-revisions`:
  <https://docs.aws.amazon.com/cli/latest/reference/codepipeline/start-pipeline-execution.html>
