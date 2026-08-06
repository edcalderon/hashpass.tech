---
title: EC2 worker → CodeBuild migration status
---

# EC2 worker → CodeBuild migration status

Checked 2026-08-06 while investigating why `hashpass-production-site` and
`bsl-hashpass-prod` are both vulnerable to the [orphaned-worker
incident](./bsl-pipeline-orphaned-worker-incident.md) class of bug. Short
version: **the migration to CodeBuild is already designed and default-on in
Terraform for the core site pipeline -- it was just never actually applied
to production.**

## What the code already says

`packages/infra/terraform/stacks/hashpass-web/variables.tf`:

```hcl
variable "production_build_execution_mode" {
  description = "Production build executor. CodeBuild is the primary path after the validated development cutover; custom is the explicit rollback."
  default     = "codebuild"
  validation {
    condition = contains(["custom", "codebuild"], lower(trimspace(var.production_build_execution_mode)))
  }
}
```

The default is `"codebuild"`, and the description explicitly frames `custom`
(the EC2 worker path) as *"the explicit rollback"* -- this is exactly the
"CodeBuild primary, EC2 easy fallback" design already intended. Same
default for `development_build_execution_mode`, and dev already runs on it
(`hashpass-dev-site` and `bsl-hashpass-dev` are both confirmed live on
`provider: CodeBuild` via `aws codepipeline get-pipeline`).

**But the live `hashpass-production-site` pipeline is still on the old
custom EC2 action** (`provider: hashpass-prod-ec2-build`, confirmed via
`aws codepipeline get-pipeline --name hashpass-production-site`), meaning
whatever tfvars were used for the last real `terraform apply` against this
stack either predate this default or explicitly override it back to
`"custom"`. No `terraform.tfvars` is committed to the repo (correctly --
it holds real credentials), so this can't be verified further from here;
whoever holds the real tfvars for this stack needs to check it.

## Why this design is already safe to flip

`module.production_build_worker` (the EC2 worker instance, its IAM role,
and the registered `aws_codepipeline_custom_action_type`) is controlled
**independently** by `var.enable_pipeline_build_workers` -- it is **not**
conditioned on `production_build_execution_mode` at all. Switching the
execution mode only changes which action provider the pipeline's `Build`
stage action references; it does not create or destroy the EC2 worker
infrastructure either way. Concretely:

- Set `production_build_execution_mode = "codebuild"` (already the
  default) → apply → the pipeline's Build stage switches to the
  `hashpass-production-site-build` CodeBuild project. The EC2 worker stays
  provisioned, untouched, idle.
- Something goes wrong → set `production_build_execution_mode = "custom"`
  explicitly → apply → the pipeline's Build stage switches back to the
  EC2 custom action. No worker infra needs to be recreated; it never left.

Both build paths run the **exact same scripts** either way
(`packages/tools/scripts/build-static-site.sh` /
`deploy-static-site.sh`, confirmed by reading both the CodeBuild buildspec
and the EC2 worker's `build-worker-user-data.sh.tftpl`), and
`build_environment` (the map of `EXPO_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` / etc.) is a single shared local passed to
`module.site` regardless of execution mode -- so there's no risk of a
CodeBuild-specific credential/ref mismatch independent of whatever's
already in the real tfvars.

## What was actually fixed here

Added `codebuild_compute_type = "BUILD_GENERAL1_LARGE"` to `module.site`
(mirroring the same fix already applied to `module.site_dev`, see the
[dev-site OOM incident](./bsl-pipeline-orphaned-worker-incident.md) --
actually a separate root cause, a Node heap OOM, not the orphaned-worker
bug, but discovered the same day). Without this, flipping production to
CodeBuild would hit the exact same `BUILD_GENERAL1_MEDIUM` (7GB) vs
default 8GB Node heap OOM that broke `hashpass-dev-site` builds, since
core's production site export is the same size or larger than dev's.
`BUILD_GENERAL1_LARGE` (15GB) matches the already-proven working
`bsl-hashpass-prod-build` CodeBuild project's sizing.

## Still needed (not done here)

1. Whoever holds the real `hashpass-web` stack tfvars should `terraform
   plan` first to confirm the only diff is the Build action provider +
   compute type (no unexpected resource replacement), then `terraform
   apply`.
2. This was not applied automatically -- no committed tfvars exists for
   this stack, and pipeline/CodeBuild mutations are outside this agent's
   own write path by design.

## `bsl-hashpass-prod` is a different, harder case -- not attempted here

Unlike `hashpass-production-site` and `bsl-hashpass-dev`,
`bsl-hashpass-prod`'s Build action in
`packages/infra/terraform/stacks/bsl-target/main.tf` is **hardcoded** to
the custom EC2 action -- there is no `production_build_is_codebuild`
conditional the way `development_build_is_codebuild` exists for
`bsl-hashpass-dev`. It also runs a fundamentally different build
(`build_script_path_hybrid`, an `sst deploy`, per the BSL prod deployment
architecture) rather than the plain static-export-and-sync scripts
core/dev use -- porting that into a CodeBuild buildspec is a real,
separate piece of work, not a one-variable flip. A `bsl-hashpass-prod-build`
CodeBuild project already exists live (`BUILD_GENERAL1_LARGE`, confirmed
via `aws codebuild batch-get-projects`) but the pipeline was never wired
to use it -- worth investigating in a follow-up, but recommend proving out
the simpler `hashpass-production-site` cutover first.
