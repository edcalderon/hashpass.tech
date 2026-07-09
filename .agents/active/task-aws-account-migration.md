# Task: Migrate HashPass AWS services to the new account

## Goal

Move the HashPass AWS-hosted services from account `058264267235` to account `952191196420` with an IaC-first, non-destructive migration path.

The migration must be reversible:

- keep the source account intact until the replacement is validated
- provision the new account in parallel
- cut traffic only after the target stack passes validation
- preserve a fast rollback path back to the original account

## Current Inventory

| Surface | Current account | Target account | Notes |
|---------|-----------------|----------------|-------|
| `hashpass.tech` | Amplify app `dy8duury54wam` in `us-east-2` | Target stack provisioned and validated via S3 endpoint | CloudFront is still blocked in the target account, so the first pass uses S3 website hosting |
| `api.hashpass.tech` / `api-dev.hashpass.tech` | Lambda + API Gateway in `us-east-1` | Target backend provisioned without public custom domains | Custom-domain cutover waits on DNS delegation |
| `bsl.hashpass.tech` / `bsl-dev.hashpass.tech` | SST/CodeBuild pipeline | Target CodeBuild + CodePipeline resources provisioned | GitHub handshake still needs to be completed in the target account |
| Android runner | EC2 runner `hashpass-mobile-release-1` | Target runner provisioned and online | Must remain reversible until the source runner is no longer needed |
| DNS | Route53 hosted zone for `hashpass.tech` | Target hosted zones provisioned | Registrar delegation still points at the source account |
| IAM / pipelines | Roles, CodeBuild, CodePipeline, artifact buckets | Target roles and buckets provisioned | Keep source versions untouched until the cutover window closes |

## Constraints

- Do not delete, detach, or disable source-account resources before the target replacement is proven.
- Prefer Terraform, SST, or scripted AWS APIs over console-only changes.
- Keep account-specific values explicit in docs and scripts.
- Make every step reversible without requiring a full rebuild of the source account.

## Follow-Up Plan

1. Document the migration workflow and rollback procedure in `apps/docs/docs/infra/migrations/aws-account-cutover.md`.
2. Add the migration page to the docs sidebar so the process is visible to operators.
3. Make the AWS helper scripts accept an explicit target-account alias so provisioning can be pointed at the destination account without reusing source-account settings.
4. Define the target-account infrastructure in IaC and deploy it in parallel with the source account.
5. Validate the target deployment before any DNS or traffic cutover.
6. Only after validation, migrate `hashpass.tech`, then BSL pipelines, then the Android EC2 runner.
7. Keep the source resources available until the rollback window is over and a restore is unnecessary.

## Rollback Strategy

- Re-point DNS back to the source account if the target stack fails validation.
- Leave the source Amplify app, pipelines, and EC2 runner intact until the new stack is stable.
- Keep target resources deployed but idle during validation so rollback is a traffic flip, not a rebuild.
- Destroy target resources only after the source account is confirmed stable and the migration is formally closed.

## Acceptance Criteria

- The migration playbook exists in docs and includes a rollback section.
- The docs navigation exposes the migration playbook.
- The AWS helper scripts can validate against an explicit target account ID.
- Target-account infrastructure is provisioned without impacting the source account.
- Rollback to the source account is a documented, low-friction process.
