# Task: CI/CD cost migration (CodeBuild/CodePipeline → GitHub Actions) + continuous cost monitoring

**Status:** SUPERSEDED — execution merged 2026-09-04
**Priority:** Historical implementation plan
**Created:** 2026-09-03
**Last updated:** 2026-09-03

> **Canonical owner:**
> [`task-build-cost-containment-and-cicd-migration.md`](task-build-cost-containment-and-cicd-migration.md)
> is the single active P0 task for build containment, GitHub Actions migration,
> deploy cadence, and cost monitoring. Its 2026-09-04 live snapshot changes
> the urgency and order of this plan. This document remains a detailed phase
> and drift-history reference; do not advance its phases independently.

Companion to [`task-aws-cost-audit-and-controls.md`](task-aws-cost-audit-and-controls.md)
(P0, billing/credit risk). That task diagnosed CodeBuild/CodePipeline as the
dominant *controllable* cost driver and did the read-only reconciliation work;
this task owns the actual migration off of them, plus turning cost review into
a recurring, dated process instead of a one-time fix. Read that doc first for
the full billing history, the `RECORD_TYPE=Usage` reconciliation gotcha, and
the standing no-EC2-provisioning-without-consent rule (applies here too, since
Phase 4 below touches BSL's EC2-backed pipelines).

## Baseline (from the cost-audit task, 2026-08-24 reconciliation)

- CodeBuild: **$81.90/mo** gross MTD at last measurement (`g1.large` $67.04 +
  `g1.medium` $14.86), the single largest controllable driver.
- CodePipeline: **$11.31/mo** gross MTD.
- Combined **~$93.21/mo**, separate from the already-resolved one-time
  zombie-EC2-worker leak documented in the cost-audit task.
- The repo is public, so GitHub Actions' standard Linux runners (4 vCPU/16GB)
  are free and unlimited for this org — a strict superset of what CodeBuild's
  `BUILD_GENERAL1_LARGE` (8 vCPU/15GB) currently provides for the ~10-12 min
  site export build. This is the core hypothesis the phased plan below tests
  before committing to a full cutover.

## Standing hazard — read before touching `hashpass-web` Terraform

`packages/infra/terraform/stacks/hashpass-web/main.tf` has a documented,
confirmed, **still-unfixed** false-drift landmine — see
`apps/docs/docs/infra/hashpass-api-target-terraform-env-drift.md`. A bare
`terraform plan`/`apply` on this stack, without reproducing undocumented
`-var` overrides, shows large false drift including destroying the live
`dev.hashpass.tech` S3 bucket and blanking `github_actions_role_arn`. Three
root causes were already documented there (2026-08-16); this task's Phase 0
work (2026-09-03, below) found and confirmed a **fourth**, previously-unknown
cause. Any `terraform apply` against this stack must be shown to the user as
a full `plan` diff for real-time confirmation before applying — no exceptions,
regardless of how routine the underlying change (e.g. an additive cache
block) looks.

## Phased rollout plan (approved 2026-09-03, dev-site first, no big-bang cutover)

### Phase 0 — Fix the dead CodeBuild cache bug (independent, low-risk, do first)

Add a project-level `cache { type = "S3", location = ... }` block to
`aws_codebuild_project.site` in
`packages/infra/terraform/modules/aws_static_site_pipeline/main.tf`,
mirroring BSL's already-working S3 cache config in the same module family.
Confirmed before this fix: all 3 non-BSL site CodeBuild projects
(`hashpass-dev-site-build`, `hashpass-prod-site-build`,
`hashpass-cbweek2026-develop-site-build`) were running `NO_CACHE`; BSL's two
projects already had `S3` cache. This alone should meaningfully cut CodeBuild
minutes independent of the GitHub Actions migration.

**Status:**
- `demo-events` stack — **DONE, live and verified.** Applied via a scoped
  `terraform plan`/`apply` against the isolated `demo-events` stack only
  (not landmine-flagged). Confirmed live via `aws codebuild
  batch-get-projects`.
- `hashpass-web` stack — **BLOCKED, not applied.** Source is committed
  (`packages/infra/terraform/modules/aws_static_site_pipeline/main.tf`, part
  of commit `dc45edf47` / released in v1.9.31), so the fix is present for
  whenever this stack's drift is reconciled, but it is **not live** for
  `hashpass-dev-site-build`/`hashpass-prod-site-build`. See below.
- `bsl-target` — not attempted; same suspicion applies per the drift doc
  (only `.tfvars.example` exists, no committed `.tfvars`), not independently
  verified.

#### `hashpass-web` apply attempt and 4th drift source found — 2026-09-03

Attempted a scoped `terraform plan -target=module.site.aws_codebuild_project.site
-target=module.site_dev.aws_codebuild_project.site` against `hashpass-web`,
reconstructing override values from `.env` and live AWS lookups
(connection ARN via `aws codepipeline get-pipeline` — real pipeline names are
`hashpass-production-site`/`hashpass-dev-site`, not the guessed
`*-site-build` names; ACM cert ARN disambiguated via the live CloudFront
distribution's `ViewerCertificate`, since two same-named certs exist).

**`-target` did not contain the blast radius.** Even scoped to only the two
CodeBuild project resources, the plan still showed:

- destruction of both live build-worker EC2 instances' CloudWatch alarms
  (`index [0] is out of range for count` — `enable_pipeline_build_workers`
  defaults `false` in Terraform but is live `true`; the stack requires a
  `pipeline_build_worker_approval_reference` value to safely reconstruct this,
  which was not available this session — this is the **new, 4th drift
  source**, not previously documented anywhere);
- creation of a duplicate `aws_sns_topic.ops_alerts` (this is drift source #3
  from the 2026-08-16 doc, re-confirmed);
- updates to both CodeBuild projects' IAM role trust policies.

Per this task's own standing hazard above and the repo's no-blind-apply
policy, **did not apply.** Plan output and a scratch `.tfvars` reconstruction
were saved locally to `/tmp/.../scratchpad/` (session-local, not committed)
for whoever picks this up next, but they are not a substitute for a properly
reconciled, committed `terraform.tfvars` or the real
`pipeline_build_worker_approval_reference` value.

**To unblock:** either locate the original approval-reference value (check
prior incident/approval records, or whoever last enabled
`enable_pipeline_build_workers` live) and reconstruct a full, correct
`terraform.tfvars`, or treat this as the moment to finally write and commit
one for this stack (redacted/`.gitignore`d appropriately) so future plans
stop guessing. Until then, prefer leaving `hashpass-web`'s CodeBuild cache
fix uncommitted-to-live and pursue Phase 1 (GitHub Actions) instead — it
sidesteps this stack's drift risk entirely for the dev-site target, since a
successful cutover retires the need to fix CodeBuild caching there at all.

### Phase 1 — GitHub Actions build-only dry run (zero AWS credentials, zero blast radius)

**Not started.** New workflow, `workflow_dispatch`-only (no auto-trigger
yet): checks out the repo, runs `build-static-site.sh` on `ubuntu-latest`,
uploads `dist/client` as a build artifact. Validates the core hypothesis (the
6GB-heap / ~10-12min build fits comfortably in a free 16GB/4vCPU runner) with
no IAM change and no risk to any live resource.

### Phase 2 — Scoped, additive IAM permissions + manual deploy dry run

**Not started.** Add a new, separate `aws_iam_role_policy` (not an edit to
the existing `hashpass-web-github-actions` role's `hashpass-web-worker-control`
policy) granting `s3:PutObject`/`DeleteObject`/`ListBucket` scoped to
`dev.hashpass.tech` only, and `cloudfront:CreateInvalidation` scoped to
distribution `E1Y06KG5U6MKCS` only. Requires the same supervised
`plan`/`apply` review as Phase 0 (same stack, same landmine). Extend the
Phase 1 workflow to run `deploy-static-site.sh` against the real dev
bucket/distribution — one manual, observed run.

### Phase 3 — Cut dev-site's automatic trigger over

**Not started.** Add `on.push.paths`-filtered auto-trigger plus
`concurrency: { cancel-in-progress: true }` to the workflow, disable
`hashpass-dev-site`'s CodePipeline trigger (keep the pipeline itself as
rollback). Monitor 1-2 weeks; confirm cost drop in Cost Explorer
(`RECORD_TYPE=Usage`, filtered `CodeBuild`) before decommissioning anything.

### Phase 4 — Roll out to the remaining 4 targets, one at a time

**Not started.** `hashpass-prod-site-build` → `hashpass-cbweek2026-develop-site-build`
(kept `workflow_dispatch`/dedicated-branch only, never on every `develop`
push) → `bsl-hashpass-dev-build` → `bsl-hashpass-prod-build`. Each gets its
own Phase 1-3 cycle; a target's CodeBuild/CodePipeline is only decommissioned
after its GitHub Actions replacement has run clean in production for an
observation window. BSL targets are EC2-pipeline-backed — the standing
no-EC2-provisioning-without-consent rule in the cost-audit task applies to
any change there.

## Continuous cost-monitoring process

1. This doc itself is the living record — update it with a new dated entry
   (mirroring `task-aws-cost-audit-and-controls.md`'s convention) whenever a
   phase advances, a blocker is found, or cost data changes meaningfully.
2. **Not yet built:** `.github/workflows/aws-cost-report.yml`, a weekly
   `schedule:`-triggered workflow using OIDC with a narrowly-scoped, additive,
   read-only policy (`ce:GetCostAndUsage`, `ce:GetCostForecast`,
   `budgets:ViewBudget` — no write actions), added the same careful way as
   Phase 2's grant above. Pulls Cost Explorer data with the
   `RECORD_TYPE=Usage` filter (see the cost-audit task's 2026-08-17 entry for
   why the unfiltered query is misleading on this account), writes a summary
   to the GH Actions job summary every run, and opens a PR appending a dated
   entry to this doc when cost moves meaningfully (>15% week-over-week) or a
   new top-cost service appears.

## Verification checklist (per phase, once started)

- Phase 0: `aws codebuild batch-get-projects` shows `cache.type = S3` on all
  3 previously-`NO_CACHE` projects; compare next build's `USE2-Build-Min`
  line item. (Done for `demo-events`; pending for `hashpass-web`/`bsl-target`.)
- Phase 1: Actions run succeeds; artifact size/content matches a recent
  CodeBuild dev-site artifact.
- Phase 2: `dev.hashpass.tech` serves the new content, the
  `api-dev.../config/versions` check passes, CloudFront invalidation
  completes.
- Phase 3: One full week of dev-site pushes deploy via Actions only; Cost
  Explorer shows dev-site's CodeBuild minutes drop to ~0.
- Continuous monitoring: first scheduled run of `aws-cost-report.yml`
  produces a job summary and, if warranted, a real PR against this doc.

## Non-goals

- Not a rewrite of the S3/CloudFront hosting layer — only the build
  trigger/compute layer moves.
- Not authorization to touch `hashpass-api-target` (the Lambda-env-wipe
  landmine, separate stack, separate document) or to re-provision any EC2
  capacity — both remain out of scope here.
