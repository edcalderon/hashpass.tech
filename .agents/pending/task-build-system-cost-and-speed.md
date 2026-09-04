# Task: Continue reducing build-system cost and build/ship latency

**Status:** SUPERSEDED — archived 2026-09-04
**Priority:** Historical decision evidence
**Created:** 2026-08-16
**Canonical task:**
[`task-build-cost-containment-and-cicd-migration.md`](../active/task-build-cost-containment-and-cicd-migration.md)
(P0, active). **Billing record:**
[`task-aws-cost-audit-and-controls.md`](../active/task-aws-cost-audit-and-controls.md).

This document preserves the 2026-08-16 CodeBuild-versus-EC2 comparison and
its operational-risk evidence. The 2026-09-04 live cost signal makes build
containment urgent: GitHub-hosted Actions, caching, right-sizing, deployment
cadence, and any successor implementation now belong only to the canonical P0
task. Do not start work from this archived task.

## Context

On 2026-08-16, the AWS cost-audit task investigated a same-day MTD jump
(console: $35.21 → $120.95) and found the dominant driver was a missing
path filter on one of five site-build CodePipelines
(`hashpass-criptolatinfest-develop-site`), causing it to rebuild on every
commit to `develop` regardless of relevance — 260.8 of 688.8 measured
build-minutes over 2 days came from that single pipeline alone. That gap
is fixed (see the cost-audit task's 2026-08-16 section for the full
writeup and the applied Terraform change in
`packages/infra/terraform/stacks/demo-events/pipeline.tf`).

While fixing that, the owner asked for a proper CodeBuild-vs-EC2 cost
comparison, since the account's build system used to run on self-managed
EC2 workers before moving to CodeBuild. This task documents that
comparison and opens the door to revisiting the backend choice later, once
there's real post-fix usage data to compare against — not as an immediate
action.

## CodeBuild vs. "proper" start/stop EC2 — the comparison

**Method:** used live-measured CodeBuild build history (688.8 total
minutes across 5 site-build projects, 2026-08-14 through 2026-08-16, via
`aws codebuild batch-get-builds`) rather than list pricing alone, so the
comparison reflects this account's actual build patterns, not a
theoretical steady-state workload.

### Raw compute-minute cost

| | CodeBuild (current) | EC2 (`m6i.xlarge`, hypothetical start/stop per build) |
|---|---|---|
| Rate | $0.02/min (`BUILD_GENERAL1_LARGE`) / $0.01/min (`BUILD_GENERAL1_MEDIUM`) | $0.192/hr ≈ $0.0032/min (this account's own historical instance type) |
| Cost for the same 688.8 measured minutes | **~$12.13** | **~$2.20** |
| Per-minute ratio | — | EC2 ≈ **5.5x cheaper** per raw compute-minute |

That ratio is real and worth taking seriously — it is *not* a reason to
dismiss EC2 outright. But three factors close most of the gap once you
account for what "proper start/stop control" actually requires in
practice, not just the sticker price of an idle-free instance-minute:

1. **Concurrency.** The measured window shows pipelines firing in bursts —
   several builds with ~10-second gaps between one ending and the next
   starting. CodeBuild scales out automatically per build; a single EC2
   worker processes one build at a time (already true and already a
   documented pain point for this account's BSL/web pipeline workers —
   see `apps/docs/docs/infra/DEPLOYMENT_MAP.md`'s EC2 pipeline worker
   section, "`instance_count = 1` means dev and prod serialize"). Matching
   tonight's actual concurrency would need 3-5 parallel EC2 workers, not
   one — multiplying idle-EBS cost and operational surface roughly in
   proportion.
2. **Boot latency.** 73 builds ran across the 5 projects in the measured
   window. A stopped→running EC2 instance needs real boot + bootstrap time
   (historically 60-120s+ for this account's mobile release runner) before
   a build can start; CodeBuild's managed pool starts in seconds. That
   latency is pure overhead an EC2 model pays on every single build a
   CodeBuild-based one doesn't.
3. **This failure mode has already cost this account real money once.**
   A cancelled CodePipeline execution previously left an EC2-backed
   worker running indefinitely because nothing signals the underlying
   build process when the pipeline is cancelled at the control-plane level
   (the "zombie worker" bug — see the cost-audit task and
   `apps/docs/docs/infra/DEPLOYMENT_MAP.md`'s "EC2 pipeline worker:
   operational gotchas" section for the confirmed incident, and
   `project_bsl_aws_migration_complete` memory noting the fix exists at
   the module level but "not yet applied to live infra"). A single missed
   stop-on-cancel edge case in a busy week can outweigh CodeBuild's entire
   incremental cost for the month. This is proven risk in this specific
   codebase, not a hypothetical.
4. **Idle storage.** Even a *stopped* EC2 instance's attached `gp3` root
   volume keeps billing (the account's mobile release runner's 80 GiB
   volume is the live example). Five separate per-project workers would
   mean five idle volumes billing regardless of build frequency —
   partially eating into the raw compute savings above.

### Current recommendation (2026-08-16): stay on CodeBuild

Not because EC2 is inherently wrong for this workload, but because the
5.5x per-minute gap, at *current* (soon-to-be-reduced, once the trigger
fix lands) build volume, is a few dollars a week — while re-introducing
more self-managed start/stop EC2 workers reopens a failure mode that has
already caused a real cost incident in this exact account. The better
near-term lever is reducing unnecessary build *volume* (the trigger fix
already applied), not changing the compute backend under an inflated
volume.

## What this task is for: future build-system improvement possibilities

None of the following are approved or scheduled — this is the option
space to evaluate once there's real usage data from the post-fix baseline
(give it at least a week or two of normal commit volume before drawing
conclusions from a small sample):

1. **Re-benchmark EC2 after the volume fix, properly this time.** The
   existing cost-audit task already specifies the right method: one real
   cold-cache build on `m6i.xlarge` (or a right-sized alternative) versus
   CodeBuild `BUILD_GENERAL1_LARGE`, same commit, same cache state,
   recording wall time, failure rate, and cost — *with the stop-on-cancel
   path proven correct first* (success, failure, *and* cancellation, not
   just the happy path). Only worth doing if post-fix CodeBuild volume
   still looks expensive relative to the account's budget.
2. **CodeBuild compute-tier right-sizing.** Several of the 5 projects run
   `BUILD_GENERAL1_LARGE` (8 vCPU/15GB) by default; `bsl-hashpass-dev`
   already runs `BUILD_GENERAL1_MEDIUM` successfully. Worth checking
   whether `hashpass-dev-site`, `hashpass-criptolatinfest-develop-site`,
   and the two `-prod` projects actually need LARGE, or whether MEDIUM
   builds successfully within an acceptable wall-clock time — this is a
   much lower-risk lever than a backend migration and could be tested
   per-project independently.
3. **Cache reuse.** CodeBuild supports S3 or local-mode build caching
   (dependency install, Metro/webpack caches) that can cut wall-clock time
   (and therefore cost) substantially on warm-cache builds without
   changing the backend at all. Not currently confirmed enabled/disabled
   for these 5 projects — worth auditing before any backend-level change.
4. **Tighten remaining trigger scopes.** The 4 already-filtered pipelines
   still include a broad `packages/**` pattern (correct, since
   `apps/mobile-app` genuinely depends on most of `packages/*` as
   workspace dependencies) — but it's worth periodically checking whether
   any specific `packages/*` subpackage (e.g.
   `packages/hashpass-links-api`, which is a standalone Lambda service, not
   bundled into the mobile app or BSL web build) could be safely excluded
   without risking a missed real rebuild. Treat any such exclusion as a
   correctness-risk change, not just a cost one — verify the actual build
   dependency graph before excluding anything, not just plausibility.
5. **A GitHub-hosted-runner alternative for some of these builds**, mirroring
   the mobile release pipeline's own `runner=github-hosted` default (see
   CLAUDE.md's Mobile Android Release Workflow section) — GitHub Actions
   minutes are billed separately from AWS and wouldn't show up in this
   Cost Explorer view at all. Only sensible for builds that don't need
   AWS-side caching/network access CodeBuild's VPC-attached mode provides;
   would need a real per-project evaluation, not a blanket switch.

## Acceptance criteria (for whichever option is eventually pursued)

- [ ] Any backend change is benchmarked against a real cold-cache build,
      not list pricing alone (matches the existing cost-audit task's own
      benchmark requirement).
- [ ] A stop-on-cancel (or equivalent lifecycle-safety) path is proven
      correct under success, failure, *and* cancellation before any new
      self-managed compute is introduced — the zombie-worker bug must not
      recur.
- [ ] Any trigger-scope tightening is verified against the actual build
      dependency graph, not assumed from path names alone.
- [ ] Expected monthly saving, risk, and rollback are documented before an
      owner approves any change, matching the cost-audit task's own
      acceptance criteria.
- [ ] Post-fix build volume (from the 2026-08-16 criptolatinfest trigger
      fix) is observed for at least a few days before being used as the
      baseline for any further decision.

## Non-goals

- Do not revert to EC2-backed build workers without a real, proven
  stop-on-cancel/stop-on-failure path and an owner-approved benchmark —
  this exact class of infrastructure has already caused one confirmed cost
  incident in this account.
- Do not change any pipeline's compute tier, cache configuration, or
  trigger scope without first confirming it against the real build
  dependency graph.
- Do not treat this task as blocking or urgent — the active P0 incident
  (`task-aws-cost-audit-and-controls.md`) already has the immediate fix
  applied; this task is deliberately paced, exploratory follow-up work.
