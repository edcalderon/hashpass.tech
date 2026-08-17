# Task: Adopt HASHPASS Secrets Management for new secrets

**Status:** ACTIVE — partially implemented, moved from pending 2026-08-16  
**Priority:** High (credential integrity and environment isolation)  
**Created:** 2026-08-04  
**Updated:** 2026-08-16 (moved pending -> active; found real, undocumented
progress against this task's own phases while triaging the pending queue)

## Progress found 2026-08-16 (not previously reflected in this file)

`apps/mobile-app/lib/server/infisical-secrets.ts` exists and is actively
wired in — confirmed via CLAUDE.md's own "Hybrid secrets policy" section
(under "Mobile Android Release Workflow"): vital/runtime secrets stay as
raw Lambda env vars, but new non-critical secrets (the
`NODEMAILER_*_INFO` family, so far) are fetched from Infisical at runtime
via a Universal Auth machine identity, project `d9ad5e75-da3b-4932-9bbd-9a1029c6732f`,
domain `https://secrets.cig.technology`. This is Phase 1 (provider
contract) and part of Phase 4 (runtime projection) from below, already
done for at least one real secret family — just never linked back to this
task file.

**Not yet reconciled: this task's plan assumes a *different* provider**
(`hashpass-6d6h` project, `hashpass-dev`/`hashpass-production`
environments) than what's actually been adopted (Infisical, project
`d9ad5e75...`). Either this task's plan is stale and should be rewritten
to match the Infisical adoption that already happened, or there are
genuinely two different secrets-management efforts in flight and that
needs reconciling before continuing — this needs an explicit decision,
not an assumption either way.

Phase 2 (read-only inventory of `.env`/GitHub Actions/Lambda/SSM
consumers) and Phase 3 (new-secret enforcement) do not appear to have
happened — no inventory artifact found, and `.env`/GitHub Actions secrets
are still the primary path for most credentials as of tonight's
Supabase-credential-drift investigation (2026-08-15/16), which touched
`.env`, GitHub Actions vars/secrets, and live Lambda env vars directly,
not Infisical.

## Decision

All new shared secrets and parameters must be created in the HASHPASS Secrets
Management project (`hashpass-6d6h`):

- environment `hashpass-dev` for development;
- environment `hashpass-production` for production.

AWS SSM Parameter Store remains a legacy runtime compatibility path for
existing projected values. KMS is a complementary cryptographic-key service,
not a replacement secret registry: use it for envelope encryption/signing,
while credentials and configuration values remain in Secrets Management. Do
not create new secrets in SSM/KMS, and do not delete existing values or keys
until a separately approved migration has moved every consumer.

Provider URL: `https://secrets.cig.technology/`  
Provider API credentials must be supplied through the approved CLI/CI
integration; never commit them to this repository.

## BSL pooler metadata

The BSL database connection metadata is safe to document, but the password is
provider-managed and must never appear here:

| Environment | Host | Port | Database | User |
| --- | --- | --- | --- | --- |
| Development | `aws-0-us-east-2.pooler.supabase.com` | `5432` | `postgres` | `postgres.fxgftanraszjjyeidvia` |
| Production | `aws-1-us-west-2.pooler.supabase.com` | `5432` | `postgres` | `postgres.mnnqryrdlhddorqsrtbn` |

Store the complete password-bearing pooler URL only in the corresponding
Secrets Management environment under `BSL_SUPABASE_DB_URL`. The application
and migration runner should receive it through an environment projection, not
from tracked files.

## Required implementation phases

1. **Provider contract:** confirm the service CLI/API, versioning, audit log,
   rotation, environment scoping, and CI authentication model.
2. **Read-only inventory:** list current `.env`, GitHub Actions, Lambda, SSM,
   and deployment consumers. Classify each secret without printing values.
3. **New-secret enforcement:** update scripts and review checks so new secrets
   are created in Secrets Management and SSM writes are rejected unless marked
   `legacy-compatibility`.
4. **Runtime projection:** add a short-lived CI/deploy step that reads the
   selected environment and injects Lambda/Expo variables without persisting
   plaintext secrets to the repository or build artifacts.
5. **Rotation and migration:** rotate one non-production secret, validate dev,
   then migrate production with rollback and a change window. Keep AWS values
   until all consumers are confirmed migrated.
6. **Retirement:** after an observation period and owner approval, remove only
   unused legacy SSM parameters. AWS KMS keys and unrelated resources are out
   of scope for automatic deletion.

## Acceptance criteria

- [ ] Provider API/CLI authentication is configured through CI secrets, not
      committed files.
- [ ] `hashpass-dev` and `hashpass-production` are isolated and auditable.
- [ ] New secret creation no longer defaults to AWS SSM/KMS.
- [ ] BSL dev and prod pooler URLs are present in the correct provider
      environment and authenticate through the pooler.
- [ ] Lambda and migration workflows consume projected values successfully.
- [ ] Rotation, rollback, audit logging, and incident recovery are tested.
- [ ] Existing AWS values remain available until every consumer is migrated.
- [ ] KMS key usage is documented separately from secret storage, with no
      credentials placed directly in KMS.

## Non-goals

- Do not paste passwords, API tokens, or service-role keys into docs, issues,
  screenshots, logs, or git history.
- Do not delete AWS SSM/KMS state as part of initial provider adoption.
- Do not change application database schemas in this task.
