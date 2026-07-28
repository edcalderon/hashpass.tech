# Infra Naming Guide

This guide keeps AWS and release resource names readable, consistent, and easy to grep.

## Principles

- Use one stable product prefix for the new BSL infra track: `bsl-hashpass`
- Prefer lowercase, hyphen-separated resource names for AWS-managed resources
- Use `dev` and `prod` for resource names
- Use `develop` and `main` only for Git branch names
- Keep region in the name only when the resource is region-bound or shared across stages
- Do not hardcode account IDs in source; derive them from AWS credentials or repo variables
- Keep legacy Amplify-era resources untouched unless you are explicitly migrating them
- Treat deletion protection as an IAM guardrail for the deploy role, not a native CodePipeline switch

## Recommended patterns

- CodeConnections connection: `<prefix>-github-<region>`
- CodePipeline pipeline: `<prefix>-<env>`
- CodeBuild project: `<prefix>-<env>-build`
- Artifact bucket: `<prefix>-pipelines-<account>-<region>`
- IAM roles:
  - Pipeline role: `BslHashpassPipelineRole`
  - CodeBuild role: `BslHashpassCodeBuildRole`
  - GitHub Actions infra deploy role: `BslHashpassInfraDeployRole`

## Current BSL infra names

**Target account (`952191196420`), current as of 2026-07-28** — `packages/infra/terraform/stacks/bsl-target`:
- Connection: reuses the existing target-account `bsl-hashpass-github-us-east-2` CodeConnections connection
- Dev pipeline: `bsl-hashpass-dev` (branch `develop`)
- Production pipeline: `bsl-hashpass-prod` (branch `main`)
- EC2 build worker custom action provider: `hashpass-bsl-ec2-build` (distinct from `hashpass-web`'s `hashpass-ec2-build` so job polling never collides)
- Both pipelines correctly wired to `hashpass-tech/hashpass.tech` — see the incident below for why this specifically mattered.

**Source account (`058264267235`), superseded, not yet decommissioned**:
- Connection: `bsl-hashpass-github-us-east-2`
- Dev pipeline: `bsl-hashpass-dev`
- Production pipeline: `bsl-hashpass-prod`
- Dev CodeBuild project: `bsl-hashpass-dev-build`
- Production CodeBuild project: `bsl-hashpass-prod-build`

**Incident (2026-07-28):** the source-account pipelines above had
`FullRepositoryId` set to `edcalderon/hashpass.tech` (a personal fork), not
the org repo. `bsl-hashpass-prod` watches that fork's `main`, which nothing
in the release automation pushes to — it silently went 3 days / ~14
releases stale (last real trigger 2026-07-25, v1.8.260) before
`bsl.hashpass.tech` showing `v1.8.273` while `hashpass.tech` was on
`v1.8.274` exposed it. Also corrected a prior misunderstanding: this
CodeBuild/CodePipeline step runs `sst deploy` directly (`pnpm --filter
@hashpass/infra run deploy:<stage>`) — it **is** "SST Console autodeploy,"
not a separate/legacy path running alongside it, as earlier docs assumed.
Full writeup: `.agents/active/task-aws-account-migration.md`.

**Target-account CodeBuild projects (`bsl-hashpass-prod-build`/`bsl-hashpass-dev-build`) are also now superseded** by the EC2-worker pipelines above — they were mirrored into target earlier but never wired into a pipeline, and won't be needed once the new stack is validated.

## Anti-patterns

- Generic names like `hashpass-infra-*` for new BSL resources
- Embedding the raw AWS account number in repo files
- Mixing branch names and environment names in resource names
- Using dots in AWS resource names when a hyphenated slug is clearer

**Found violating this exact rule (2026-07-28):** `hashpass-infra-production-build`
and `hashpass-infra-dev-build`, two source-account CodeBuild projects with
zero build history ever. Their generic naming plus complete disuse strongly
suggests dead scaffolding predating this guide — candidate for removal
once someone with source-account access confirms. See
`.agents/active/task-aws-account-migration.md`.

## When to introduce a new name

Create a new name when:

- The resource belongs to a different product surface
- The resource moves to a new region
- The resource represents a new lifecycle or stage
- The old name no longer communicates intent clearly

Do not rename legacy resources just for style cleanup unless the migration path is already planned.
