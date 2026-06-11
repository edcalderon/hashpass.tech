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

- Connection: `bsl-hashpass-github-us-east-2`
- Dev pipeline: `bsl-hashpass-dev`
- Production pipeline: `bsl-hashpass-prod`
- Dev CodeBuild project: `bsl-hashpass-dev-build`
- Production CodeBuild project: `bsl-hashpass-prod-build`

## Anti-patterns

- Generic names like `hashpass-infra-*` for new BSL resources
- Embedding the raw AWS account number in repo files
- Mixing branch names and environment names in resource names
- Using dots in AWS resource names when a hyphenated slug is clearer

## When to introduce a new name

Create a new name when:

- The resource belongs to a different product surface
- The resource moves to a new region
- The resource represents a new lifecycle or stage
- The old name no longer communicates intent clearly

Do not rename legacy resources just for style cleanup unless the migration path is already planned.
