---
title: BSL pipeline orphaned-worker incident (2026-08-06)
---

# BSL pipeline orphaned-worker incident (2026-08-06)

## Symptom

Users on `bsl.hashpass.tech` saw the in-app "update available" modal correctly
report a newer version, clicked accept, watched the app clear caches and hard
reload — and the app still reported the old version afterward. Repeated
reloads made no difference.

This looked like a client-side caching bug (the obvious suspects: service
worker, CloudFront, the `performHardReload()` cache-busting query param) but
wasn't one. It was a stuck deployment pipeline: the live static site bundle
was genuinely still v1.8.329, three releases (v1.8.330, v1.8.331, v1.8.332)
behind.

## How to tell the difference next time

Before assuming a stale-reload bug is client-side, check what's *actually*
being served:

```bash
# 1. Confirm the reload is genuinely hitting origin, not an edge cache
curl -sI "https://bsl.hashpass.tech/?_hpv=$(date +%s)" | grep -iE "x-cache|cache-control"
# Expect: x-cache: Miss from cloudfront, cache-control: no-cache,no-store,must-revalidate
# (index.html is deployed with these headers already — if you see a Hit or a
# long max-age here, the bug really is CDN caching, not this incident.)

# 2. Extract the JS bundle path index.html actually points at, and grep it
# for the version string baked in at build time
curl -s "https://bsl.hashpass.tech/?_hpv=$(date +%s)" | grep -oE '"/_expo/static/js/web/index-[a-f0-9]+\.js"'
curl -s "https://bsl.hashpass.tech/_expo/static/js/web/index-<hash>.js" | grep -oE '"1\.8\.[0-9]+"' | sort -u

# 3. Compare against what the API layer (a *separate* deployment, the Lambda)
# thinks is current -- this can legitimately be ahead of the static site,
# since they deploy independently
curl -s "https://api.hashpass.tech/api/config/versions" | grep currentVersion
```

If the bundle's baked-in version is behind what the release tags say should
be live, the static site deploy pipeline itself hasn't shipped. Go to the
pipeline, not the browser.

## Root cause

`bsl-hashpass-prod`'s CodePipeline had two executions stuck `InProgress` for
3+ hours (one from the v1.8.330 release, one from v1.8.331, queued behind
it — `aws_pipeline_ec2_worker`'s single EC2 worker processes one job at a
time, see the "EC2 pipeline worker: operational gotchas" section referenced
from `.agents/done/task-aws-account-migration.md`). The last execution that
actually succeeded was v1.8.329's — matching exactly what was still live.

Checking the worker found **zero running EC2 instances** for this pipeline at
all. The worker process/instance had died or stopped without ever calling
back to CodePipeline with a success or failure result, leaving the execution
permanently orphaned. Confirmed via CPU/instance-state checks, not guessed.

### Why the existing self-timeout guard didn't help

`aws_pipeline_ec2_worker`'s `build_timeout_seconds` variable (default 2700s /
45min) makes `worker-loop.sh` kill a hung build process and report failure —
this was added specifically after a July 2026 incident where a cancelled
CodePipeline execution's build process kept running forever inside a live
worker. That guard assumes the **worker process is alive** to run it. It does
nothing if the **instance itself** dies, crashes, or is stopped — there's
nothing left inside the instance to run the timeout logic or call
`put-job-failure-result`. That's exactly what happened here.

## Fix

1. **Immediate**: manually stopped/abandoned the orphaned pipeline execution
   (`aws codepipeline stop-pipeline-execution ... --abandon`) to unblock the
   queue, then let the next execution run.
2. **Structural**: added `timeout_in_minutes = 60` to both BSL pipeline
   actions (`bsl-hashpass-prod` and `bsl-hashpass-dev`'s `DeployInfra`
   action, `packages/infra/terraform/stacks/bsl-target/main.tf`). This is a
   **CodePipeline-enforced** timeout — the service itself marks the action
   failed after 60 minutes regardless of whether any worker is alive to
   report back. It works precisely in the failure mode the worker's own
   internal guard can't cover, and requires `pipeline_type = "V2"` (both BSL
   pipelines already are).

`hashpass-web`'s pipelines (`hashpass-dev-site` / `hashpass-production-site`,
`aws_static_site_pipeline` module) have the identical worker architecture and
identical exposure to this failure mode, but are still `pipeline_type = "V1"`
(the `enable_path_filtered_trigger` variable that upgrades them to V2 is
off by default, with an explicit "opt in deliberately once ready" note in
its description — it wasn't flipped as a side effect of this fix). **This is
a known follow-up**: upgrading those two pipelines to V2 and adding the same
`timeout_in_minutes` is the same fix, just not yet applied there.

## If this happens again

```bash
# 1. Confirm no worker is actually running (vs. a slow-but-real build)
aws ec2 describe-instances --region us-east-2 --profile hashpass \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].{Id:InstanceId,Name:Tags[?Key==`Name`]|[0].Value}'

# 2. List recent executions, find the stuck one(s)
aws codepipeline list-pipeline-executions --pipeline-name bsl-hashpass-prod \
  --region us-east-2 --profile hashpass --max-items 5

# 3. Abandon it (use the FULL execution id from step 2, not the truncated
# one gh/aws sometimes prints)
aws codepipeline stop-pipeline-execution --pipeline-name bsl-hashpass-prod \
  --pipeline-execution-id <full-id> --abandon \
  --reason "orphaned, no worker running" --region us-east-2 --profile hashpass
```

With the `timeout_in_minutes = 60` guard now in place, this specific
"stuck forever" shape shouldn't recur — a dead worker now just means the
action fails cleanly after an hour instead of hanging indefinitely. It's
still worth periodically spot-checking a live domain's deployed bundle
version against its release tag (the three-command check at the top of this
doc) since a *failed* deploy still needs a human to notice and re-trigger it.
