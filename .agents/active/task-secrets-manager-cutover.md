# Task: Adopt HASHPASS Secrets Management for new secrets

**Status:** ACTIVE — partially implemented, three-way provider reconciliation
now required before continuing  
**Priority:** High (credential integrity and environment isolation) —
escalated 2026-08-17: real secret duplication confirmed across two live
Infisical projects, not just a documentation gap
**Created:** 2026-08-04  
**Updated:** 2026-08-17 (owner directive: adopt the newly-provisioned
dedicated Hashpass Infisical org as the default going forward; formalize a
hybrid AWS/Infisical split for the most critical secrets; a THIRD, previously
undocumented Infisical reference discovered while auditing this)

## Update 2026-08-17 — a third Infisical reference found, real duplication confirmed

The repo owner added a new block to the root `.env`
(`HASHPASS_INFISICAL_URL`, `HASHPASS_INFISICAL_ORG_*`,
`HASHPASS_INFISICAL_ADMIN_TOKEN`) pointing at a **dedicated Hashpass
organization** on the same shared Infisical instance
(`https://secrets.cig.technology`) — distinct from both providers this task
already knew about:

| # | Reference | Where it's used | Status |
|---|---|---|---|
| 1 | `hashpass-6d6h` project, `hashpass-dev`/`hashpass-production` envs | This task's own original "Decision" section (2026-08-04) | Never confirmed to actually exist or hold anything — likely superseded before it was ever adopted |
| 2 | Project `d9ad5e75-da3b-4932-9bbd-9a1029c6732f` (root `.env`'s plain `INFISICAL_PROJECT_ID`) | `apps/mobile-app/lib/server/infisical-secrets.ts`, live runtime, `NODEMAILER_*_INFO` family | Currently live/wired-in, found 2026-08-16 |
| 3 | Org `a8aa0e14-48a3-4cc9-aa88-ef863a0fb1a0` (slug `hashpass-pm4y`), workspaces `hashpass-development` (`e02ba63a-bbe1-4c3a-9bac-b2601691d7ef`, slug `hashpass-development-nfb-i`) and `hashpass-production` (`2d8e765d-e58f-47f7-add9-c64eefb09601`, slug `hashpass-production-wg-h4`), plus an unrelated `Certificate Manager` workspace | Newly added to `.env` 2026-08-17, admin identity token, used to investigate the Forgejo CI-fallback task (`.agents/pending/task-forgejo-ci-fallback-onboarding.md`) | **This is now the designated default going forward per owner directive below** |

**Confirmed real duplication, not just a naming mismatch:** reference #3's
`hashpass-production` workspace already contains its own
`NODEMAILER_HOST_INFO`/`NODEMAILER_PORT_INFO`/`NODEMAILER_USER_INFO`/
`NODEMAILER_FROM_INFO`/`NODEMAILER_PASS_INFO` keys — the exact same secret
family reference #2 already serves at runtime today. Two live copies of the
same credentials exist right now, in two different Infisical projects, with
no indication either is authoritative over the other. This needs resolving
as part of the migration below, not left as parallel drift.

Reference #3's `hashpass-production` workspace also holds `FORGEJO_URL`/
`FORGEJO_USERNAME`/`FORGEJO_PASSWORD`/`FORGEJO_PAT` — credentials for the
separate Forgejo CI-fallback effort, not app runtime config. That account is
currently in a Forgejo-enforced "must change password" state that blocks
**all** API and basic-auth use until resolved through the real login+
change-password web flow — see
`.agents/pending/task-forgejo-ci-fallback-onboarding.md` for that thread;
noted here only because it lives in the same Infisical project as the
NODEMAILER duplication above.

## Owner directive 2026-08-17 — hybrid AWS/Infisical split

Going forward:

- **Infisical org `hashpass-pm4y` (reference #3 above) is the preferred/
  default secret store for both dev and prod**, superseding reference #2
  (`d9ad5e75...`) and the never-adopted reference #1 (`hashpass-6d6h`).
  Future per-product projects (e.g. a `club` project, alongside the existing
  `hashpass-development`/`hashpass-production`) can be created under this
  same org as needed — no new orgs, no new shared-instance sprawl.
- **The most critical, highest-blast-radius secrets stay AWS-only, with no
  redundant copy in Infisical**, specifically to minimize the number of
  places a critical credential could leak from. Explicit flagship example
  given: **Supabase production database credentials/connection strings**
  must live only in AWS (Lambda env vars / Secrets Manager / SSM, per
  whatever this repo's existing pattern already is for that credential —
  see `apps/docs/docs/auth/supabase-project-map.md` and the Lambda env-sync
  logic in `packages/tools/scripts/deploy-api-lambda.sh`), never mirrored
  into Infisical even for convenience.
- Below that top tier, non-critical and moderate-sensitivity secrets
  (the `NODEMAILER_*_INFO` family already proves this pattern works,
  Forgejo CI-fallback credentials, future similar config) are the right fit
  for Infisical.
- **Not yet defined: the actual line between "AWS-only critical" and
  "Infisical-eligible."** Supabase prod DB creds are the one explicit
  example given so far — the rest of this repo's real secret inventory
  (Supabase service-role keys, OAuth client secrets, Sentry DSNs/auth
  tokens, SMTP creds, the Android signing keystore, Google Play service
  account JSON, EXPO_TOKEN*, RELEASE_AUTOMATION_TOKEN, AWS access keys
  themselves, etc.) needs to actually be triaged against this line, not
  assumed. This is now the primary open work of this task — see the new
  checklist item below.

## Progress found 2026-08-16 (not previously reflected in this file)

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

## Decision (superseded 2026-08-17 — see directive above; kept for history)

~~All new shared secrets and parameters must be created in the HASHPASS
Secrets Management project (`hashpass-6d6h`)~~ — this project was never
actually confirmed to exist and is superseded by org `hashpass-pm4y`
(reference #3 above). The environment-naming intent (`dev` vs `production`
isolation) carries forward unchanged; only the specific project/org
reference is corrected.

AWS SSM Parameter Store remains a legacy runtime compatibility path for
existing projected values. KMS is a complementary cryptographic-key service,
not a replacement secret registry: use it for envelope encryption/signing,
while credentials and configuration values remain in Secrets Management. Do
not create new secrets in SSM/KMS, and do not delete existing values or keys
until a separately approved migration has moved every consumer. **Per the
2026-08-17 directive, this now applies specifically to the AWS-only critical
tier** (Supabase prod DB creds, and whatever else the triage below
determines belongs there) — that tier stays AWS-only by design, not as a
"legacy compatibility" leftover to eventually migrate away from.

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

### Added 2026-08-17 (owner directive — now the primary open work)

- [ ] **Provider capability audit**: does self-hosted Infisical at
      `secrets.cig.technology` actually offer KMS-equivalent functionality
      (envelope encryption, key rotation, signing) beyond plain
      secret-at-rest storage, or is "KMS potential" aspirational? Check the
      instance's actual enabled features/plan tier before assuming parity
      with AWS KMS — don't take the product name at face value.
- [ ] **Reconcile the NODEMAILER_*_INFO duplication** between reference #2
      (`d9ad5e75...`, live in `infisical-secrets.ts` today) and reference #3
      (`hashpass-pm4y` org's `hashpass-production` workspace, added
      2026-08-17): confirm which is authoritative, migrate
      `infisical-secrets.ts` to read from reference #3 if that's the
      decision, then remove the stale copy — don't leave both live
      indefinitely.
- [ ] **Full secret inventory + AWS-only vs. Infisical-eligible triage**:
      enumerate every secret currently in `.env`, GitHub Actions
      vars/secrets, Lambda env vars, and SSM (Phase 2 below, not yet done),
      and explicitly classify each one against the new hybrid line. Supabase
      production DB credentials are the one given example of "AWS-only, no
      Infisical copy" — everything else needs a real decision, not an
      assumption. Produce this as a table in this file (secret name,
      current location(s), classification, target location), not just a
      verbal conclusion.
- [ ] **Migrate reference #2's consumers to reference #3** (or formally
      decide to keep #2 and retire #3's duplicate copy instead — pick one,
      don't run both long-term) once the triage above confirms which secret
      family belongs where.
- [ ] Update `CLAUDE.md` with the finalized hybrid policy once the triage is
      done — there is currently **no** Infisical/secrets-management section
      in `CLAUDE.md` at all (confirmed via direct grep 2026-08-17), despite
      the CIG-2 Forgejo task file's own reference to "CLAUDE.md's
      2026-07-03 mandate." That mandate, if it exists, is not written down
      anywhere in this repo yet — either find where it actually lives and
      link it, or write it fresh as part of closing this task.

## Non-goals

- Do not paste passwords, API tokens, or service-role keys into docs, issues,
  screenshots, logs, or git history.
- Do not delete AWS SSM/KMS state as part of initial provider adoption.
- Do not change application database schemas in this task.
