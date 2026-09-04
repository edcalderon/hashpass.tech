# GitHub outage / CI-health monitor

Added 2026-09-04 as part of the GitHub-hosted static-site migration
(`.agents/active/task-build-cost-containment-and-cicd-migration.md`). This is
the "detect and alert" half of that migration's recovery design; the "act"
half is the existing, human-run
[`start-web-pipeline-disaster-recovery.sh`](../../../../packages/tools/scripts/start-web-pipeline-disaster-recovery.sh).

## Why detect-and-alert, not auto-failover

The task doc is explicit: **"Do not auto-fail over on a single GitHub Actions
failure: that can run two deployments for one revision and recreate the
CodeBuild cost spike"** that this whole migration exists to fix. An automatic
trigger that fires on a single failed run cannot tell a real infrastructure
outage apart from an ordinary broken commit, and firing wrongly costs real
CodeBuild minutes against an already-thin monthly budget.

So the monitor's job stops at getting a human's attention with the right
context and the exact next command. A human still decides whether the
break-glass path is actually warranted, and runs it.

## What the monitor checks

[`.github/workflows/github-outage-monitor.yml`](../../../../.github/workflows/github-outage-monitor.yml)
runs on a 15-minute schedule (offset off the `:00`/`:30` marks) plus manual
`workflow_dispatch`:

1. **Primary signal — githubstatus.com.** Fetches
   `https://www.githubstatus.com/api/v2/summary.json` and reads the
   `Actions` component's indicator (`none` = operational). Any non-`none`,
   non-`unknown` indicator is the trigger condition. This is GitHub's own
   authoritative incident signal, not an inference from our own workflow
   runs, so it doesn't confuse "someone pushed a broken commit" with "GitHub
   Actions is degraded."
2. **Corroborating signal — recent watched-workflow runs.** Lists the last 5
   runs of `github-hosted-static-site-deploy.yml` and `infra-deploy.yml` and
   reports the last 3 conclusions. Three consecutive non-success runs is
   noted in the alert body for context but is **not** by itself a trigger —
   it's too easy to produce with an ordinary bad commit, and treating it as
   a trigger would reintroduce the false-positive risk the task doc warns
   about.
3. **Repo-visibility check.** The free-tier-quota half of the original ask
   is very likely moot for this repo today: standard GitHub-hosted Linux
   runners are free and unlimited for public repositories (see the task
   doc's References section), and `hashpass-tech/hashpass.tech` is public.
   The workflow checks `repos/{owner}/{repo}.private` on every run and emits
   a `::warning::` (visible in the Actions run summary) if the repo is ever
   made private — that's the moment a real quota check against the Actions
   billing API would need to be added, and this workflow does not attempt
   to build that blind ahead of time.

On a trip, it opens (or comments on an existing) issue labeled
`github-outage-alert` with the githubstatus indicator, any open incidents,
the recent-run report, and the exact break-glass command template. When the
indicator returns to `none`, it comments and auto-closes that issue.

## Self-detection limitation

This monitor runs on GitHub Actions itself. A **complete** GitHub Actions
outage — not just degraded/partial — means the monitor cannot run or alert
either; you'd learn about that the same way you'd notice any other GitHub
unavailability. It reliably catches partial/regional degradation and
elevated failure rates, which is what most real GitHub incidents look like,
but it is not a substitute for checking
[githubstatus.com](https://www.githubstatus.com) yourself if GitHub seems
completely unreachable.

## The break-glass path (unchanged, still fully manual)

1. Confirm on githubstatus.com yourself that this is a real, sustained
   Actions-service outage.
2. **Confirm GitHub source delivery still works, not just Actions.** The
   retained AWS pipeline's source stage is a `CodeStarSourceConnection`
   (CodeConnections) action — it fetches the commit from GitHub the same way
   Actions' own checkout does. If GitHub's git hosting/API is unreachable,
   not just the Actions runner queue, the AWS fallback **cannot** fetch a new
   revision either. In that case the correct response is to leave the
   already-deployed version serving; recovering a new build needs a
   separately maintained source mirror, which does not exist today.
3. Disable the affected pipeline's normal CodeConnections trigger first (see
   the task doc's `dev_aws_pipeline_source_detect_changes` Terraform
   variable — currently defaulted to automatic/unset, since the AWS pipeline
   is still the live automatic dev deploy path during the migration's
   observation period).
4. Run the guarded command from a trusted operator machine with the
   `hashpass` AWS profile:

   ```bash
   EXPECTED_AWS_ACCOUNT_ID=<private, from .env AWS_TARGET_ACCOUNT_ID> \
     packages/tools/scripts/start-web-pipeline-disaster-recovery.sh \
     --environment development|production \
     --commit <full-40-char-commit-sha> \
     --incident "<free-text incident reference, e.g. githubstatus link>" \
     --execute
   ```

   Omit `--execute` first for a dry run — it's the default and just prints
   what would happen. The script itself refuses to run if the pipeline's
   normal trigger is still enabled or if there's already an active
   execution, so step 3 is enforced, not just documented.

## Current migration state (see the task doc for the live checklist)

As of 2026-09-04: the dev-only GitHub OIDC deploy role
(`hashpass-development-static-site-github-actions`) is applied, the
`development` GitHub environment exists with `main`/`develop` branch
restrictions, `AWS_STATIC_SITE_DEPLOY_ROLE_ARN` is set on it, and one
observed manual dev deploy has been run through
`github-hosted-static-site-deploy.yml`. The AWS `hashpass-dev-site`
CodePipeline's automatic `develop`-push trigger is **still enabled** — it
remains the live automatic path until the GitHub-hosted path completes its
observation period, per the task doc's ordered containment plan. Only after
that does `dev_aws_pipeline_source_detect_changes` get set to disable it.
