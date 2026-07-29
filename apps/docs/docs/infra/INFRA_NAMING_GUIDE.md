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

**Target account (`<target-account-id>`), current as of 2026-07-28** — `packages/infra/terraform/stacks/bsl-target`:
- Connection: reuses the existing target-account `bsl-hashpass-github-us-east-2` CodeConnections connection
- Dev pipeline: `bsl-hashpass-dev` (branch `develop`) — **hybrid deploy** (plain `expo export` + S3 sync via `build-bsl-static-site.sh`, no SST), live and serving `bsl-dev.hashpass.tech` since 2026-07-28
- Production pipeline: `bsl-hashpass-prod` (branch `main`) — **switched to the same hybrid script 2026-07-29**; cutover not finished (CloudFront origin still points at SST's placeholder, so the source-account pipeline is still the live serving path)
- Dev S3 bucket: `bsl-hashpass-bsl-dev-site-<target-account-id>-us-east-2`
- Prod S3 bucket: `bsl-hashpass-bsl-prod-site-<target-account-id>-us-east-2`
- EC2 build worker custom action provider: `hashpass-bsl-ec2-build` (distinct from `hashpass-web`'s `hashpass-ec2-build` so job polling never collides)
- Both pipelines correctly wired to `hashpass-tech/hashpass.tech` — see the incident below for why this specifically mattered.

**Source account (`<source-account-id>`)**:
- CloudFront distributions: `bsl.hashpass.tech` → `E2FCDJB1JCS7TW` (still SST-managed), `bsl-dev.hashpass.tech` → `E279RW9PP52TC0` (taken out of SST's control 2026-07-28, origin now points at the target bucket above)
- Prod pipeline: `bsl-hashpass-prod` — repo wiring fixed 2026-07-28, still the live production path, not yet cut over to the hybrid
- Prod CodeBuild project: `bsl-hashpass-prod-build`
- ~~Dev pipeline `bsl-hashpass-dev`~~ / ~~Dev CodeBuild project `bsl-hashpass-dev-build`~~ — **deleted 2026-07-28**, superseded by the target-account hybrid; kept running would have risked SST reverting the hybrid on the next `develop` push.

**Incident (2026-07-25 to 2026-07-28):** the source-account pipelines above had
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

**Why dev moved to a hybrid instead of finishing the target-account SST path:** the target account can't create new CloudFront distributions yet (`AccessDenied: account must be verified`, an AWS anti-fraud check for new/low-usage accounts — AWS Support case submitted 2026-07-28). Dev's hybrid keeps the existing source-account distribution (already has a valid cert, no new domain validation needed) and just repoints its origin at a plain target-account S3 bucket, sidestepping the blocked `CreateDistribution` call entirely. Prod hasn't needed this yet since it's still fully on the source-account SST path.

**Target-account CodeBuild projects (`bsl-hashpass-prod-build`/`bsl-hashpass-dev-build`) are also now superseded** by the EC2-worker pipelines above — they were mirrored into target earlier but never wired into a pipeline, and won't be needed once the new stack is validated.

## Anti-patterns

- Generic names like `hashpass-infra-*` for new BSL resources
- Embedding the raw AWS account number in repo files
- Mixing branch names and environment names in resource names
- Using dots in AWS resource names when a hyphenated slug is clearer

**Found violating this exact rule (2026-07-28):** `hashpass-infra-production-build`
and `hashpass-infra-dev-build`, two source-account CodeBuild projects with
zero build history ever. Their generic naming plus complete disuse strongly
suggested dead scaffolding predating this guide — **deleted 2026-07-28**
after re-confirming zero build history immediately before deletion. See
`.agents/active/task-aws-account-migration.md`.

## When to introduce a new name

Create a new name when:

- The resource belongs to a different product surface
- The resource moves to a new region
- The resource represents a new lifecycle or stage
- The old name no longer communicates intent clearly

Do not rename legacy resources just for style cleanup unless the migration path is already planned.
