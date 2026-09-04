# Task: Critical build-cost containment and CI/CD migration

**Status:** IN PROGRESS
**Priority:** P0 — hard $50/month production ceiling at immediate risk
**Created / last updated:** 2026-09-04
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

## Verified current state — 2026-09-04

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
- [x] Added an un-applied Terraform definition for a **development-only**
      GitHub OIDC role. Its subject is restricted to the `development` GitHub
      environment and its policy is restricted to the development site bucket,
      CloudFront distribution, and API Lambda. It has no EC2 or CodePipeline
      permissions.
- [ ] The workflow cannot yet be remotely dispatched from its feature branch:
      GitHub registers `workflow_dispatch` only after a workflow reaches the
      default branch. Do not merge merely to bypass that guard; use the normal
      protected release/PR path when the rollout change is ready for review.
- [ ] No AWS role, GitHub environment, repository variable, site, Lambda, or
      CloudFront resource has been changed. `hashpass-web` still has documented
      Terraform drift, so a full reviewed plan is required before enabling the
      role or running the observed development deployment.

Production is explicitly out of scope until development has passed. It needs a
separate least-privilege role, a protected `production` GitHub environment,
a reviewed/applied Terraform plan, an observed manual deployment, a rollback
path, and an observation window. A development role must never be reused for
production.

### Recovery design — GitHub-hosted primary, AWS break-glass fallback

The public site and API remain available during a GitHub Actions outage because
they are already served from AWS; build-system availability is a separate SLO.
The retained AWS development pipeline is the recovery path, but it must not
also automatically build every source push once GitHub Actions is primary.

- [x] Added `start-web-pipeline-disaster-recovery.sh`, a guarded operator
      command that requires the intended environment, full commit SHA, incident
      reference, private expected AWS account ID, and an explicit `--execute`.
      It checks that no pipeline execution is active and starts the exact source
      revision only after the normal AWS source trigger is disabled.
- [x] Added Terraform support for manual-only retained development recovery:
      it sets `DetectChanges = false` **and removes the V2 webhook trigger**.
      It defaults to automatic detection, so current production behavior is
      unchanged until the migration gate is deliberately applied.
- [ ] Add an independent availability monitor/alert for GitHub Actions and
      record the owner/on-call route. The monitor may alert on sustained loss
      of Actions availability; it must not automatically start AWS builds.
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
   concurrency group using `cancel-in-progress: true`. Only the newest commit
   may consume deployment capacity.
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
      CodePipeline cost until the forecast is below $50 or the owner is warned
      that the ceiling will be breached.
- [ ] Verify budget and anomaly-alert recipients and obtain the Billing →
      Credits export (credit scope, remaining balance, and expiry). Budgets
      alert; they do not stop builds.

### 1. Immediate execution containment — NEXT, approval-gated

- [ ] Map the CBWeek development deploy's required availability and rollback
      expectation, then prepare a reversible change that removes or gates its
      automatic `develop` webhook. Preserve a manual/dedicated-branch rollback
      path. Do not disable it before its replacement succeeds.
- [ ] Inspect the other four build targets' executions and identify the
      highest-minute non-production target next. Do not blanket-disable
      production paths.
- [ ] Do not manually rerun CodePipeline/CodeBuild jobs while containment is
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
      It remains un-applied. PR workflows stay credentialless; only a
      `development` environment deployment job can assume it.
- [ ] Before an AWS apply or setting `AWS_STATIC_SITE_DEPLOY_ROLE_ARN`, create
      the `development` GitHub environment, scope that variable to it, and
      restrict deployment branches to the intended protected source branch.
      The OIDC subject restriction is environment-specific, not branch-specific.
- [ ] Show the complete `hashpass-web` Terraform plan to the owner and obtain
      explicit, real-time approval immediately before apply. The additive role
      source does not bypass this stack's false-drift guard.
- [ ] Run one observed manual development deploy; verify the public site,
      CloudFront invalidation, and API-version guard before enabling any
      automatic trigger. This deployment updates both the development site and
      its API Lambda artifact; it is not a static-files-only operation.
- [ ] Enable exact `paths` filters plus a unique environment concurrency group
      with `cancel-in-progress: true`; retain the AWS pipeline only as a
      documented rollback during the observation period. Once GitHub Actions
      is primary, set the retained development pipeline's
      `dev_aws_pipeline_source_detect_changes` to `false`; manual
      break-glass runs remain possible.

### 3. Retire AWS build execution one target at a time

- [ ] After a full clean observation period, disable the migrated target's AWS
      automatic trigger first, then observe Cost Explorer before deleting any
      pipeline/project.
- [ ] Migrate in this order: the CBWeek development target, HashPass
      development, HashPass production, BSL development, then BSL production.
      Each target needs separate artifact, deploy, rollback, and production
      acceptance evidence.
- [ ] Do not provision or re-enable EC2. The historical EC2 comparison is
      archived evidence only; its zombie-worker failure mode remains a hard
      exclusion.

### 4. Secondary savings after containment

- [ ] Apply/verify S3 dependency caching only where the Terraform stack can be
      planned safely. `hashpass-web` has documented false drift: no blind apply
      is allowed.
- [ ] Benchmark Medium only for development work, using the same representative
      cold and warm cache commits and a documented rollback. Do not resize
      production from list pricing alone.
- [ ] Tighten path filters only from the actual dependency graph; broad shared
      `packages/**` is not evidence that a package is safe to exclude.

## Exit criteria

- [ ] Daily evidence shows a credible month-end result at or below $50; if it
      cannot, notify the owner immediately rather than treating the budget
      alert as enforcement.
- [ ] The first target's GitHub artifact, development deployment, API-version
      guard, and rollback pass before its CodePipeline trigger is disabled.
- [ ] Each migrated target has an independent observation period with its
      CodeBuild minutes near zero before the AWS resources are retired.
- [ ] No new EC2, external build vendor, or self-hosted runner is introduced.
- [ ] Every AWS change has a reviewed plan, named owner approval, and rollback
      steps; `hashpass-web` Terraform remains subject to its documented drift
      safeguards.

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
