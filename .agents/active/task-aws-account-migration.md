# Task: Migrate HashPass AWS services to the new account

## Goal

Move the HashPass AWS-hosted services from account `058264267235` (source)
to account `952191196420` (target) with an IaC-first, non-destructive
migration path.

The migration must be reversible:

- keep the source account intact until the replacement is validated
- provision the new account in parallel
- cut traffic only after the target stack passes validation
- preserve a fast rollback path back to the original account

**Decision (2026-07-28): DNS/hosted zone hosting stays on the source account
for now.** `hashpass.tech`, `hashpass.club`, `hashpass.lat`, and
`hashpass.info` can keep their authoritative Route53 zones and registrar
delegation in `058264267235` indefinitely — this is an explicit scope
reduction, not a gap. `hashpass.club` and `hashpass.info` also carry live
email routing (MX/DKIM/DMARC/autodiscover records), which raises the
migration cost of moving DNS well above the benefit; there is no compelling
reason to move zone hosting once the actual compute/services behind each
domain are on the target account. The remaining work below is about the
*services*, not the zones.

## Verified current state (2026-07-28)

Audited both accounts live via AWS CLI (`default` profile = source
`058264267235`, `hashpass` profile = target `952191196420`) rather than
relying on prior documentation, which had drifted from reality in a few
places (see "Corrections" below).

| Surface | Source account (`058264267235`) | Target account (`952191196420`) | Status |
|---|---|---|---|
| `hashpass.tech` web | CloudFront `E2SQE7ZSNJ4MMI` (aliases `hashpass.tech`, `www.hashpass.tech`) — **origin already points at the target-account S3 bucket** `hashpass-production-site-952191196420-us-east-2` | S3 site bucket + CodePipeline `hashpass-production-site` (prod) and `hashpass-dev-site` (dev), ACM cert for `hashpass.tech` already `ISSUED` in `us-east-1` | **Compute migrated.** Only the CloudFront distribution + DNS alias itself is still source-side, by the DNS decision above this is fine to leave as-is indefinitely (source CDN → target origin is a stable, working shape, not merely a transient step) |
| `dev.hashpass.tech` | CloudFront `E2A1QBPJVGUFI4` — **origin already points at target bucket** `dev.hashpass.tech` | Same site pipeline as above (`hashpass-dev-site`) | Same shape as prod — compute on target, CDN alias on source, stable |
| `api.hashpass.tech` / `api-dev.hashpass.tech` | Nothing found (no matching Lambda/API Gateway in source `us-east-1`) | Lambda `hashpass-prod-expo-router-api` / `hashpass-dev-expo-router-api`, API Gateway `hashpass-prod-http-api` / `hashpass-dev-http-api`, ACM certs for both hostnames `ISSUED` | **Fully migrated.** No further action. |
| BSL (`bsl.hashpass.tech` / `bsl-dev.hashpass.tech`) | CodeBuild `bsl-hashpass-prod-build`/`bsl-hashpass-dev-build` + CodePipeline `bsl-hashpass-dev`/`bsl-hashpass-prod` (both in `us-east-2`, extensive real build history) — CloudFront distributions exist but with an SST placeholder origin (`placeholder.sst.dev`), not a source-account origin | CodeBuild `bsl-hashpass-prod-build`/`bsl-hashpass-dev-build` exist (mirrored), but **no matching CodePipeline** — the pipeline/trigger wiring was never completed | **Partial.** The build projects were mirrored into target but never wired into an actual pipeline (matches the original "GitHub handshake still needs to be completed" note — still true). BSL's real deploy path today is CLAUDE.md's SST Console autodeploy, which may make this Terraform-managed CodeBuild/CodePipeline path obsolete rather than something to finish — needs a decision, not just more IaC work (see Next Steps). |
| Android runner | EC2 `i-0a2e763270ffd2b62` (`hashpass-mobile-release-1`), **stopped**, no credentials in this repo to inspect further | EC2 `i-05628f925bb57e2f1`, live, confirmed handling real builds today (internal/alpha/beta/production all succeeded 2026-07-28), resized to `t3a.xlarge` | **Fully migrated and validated.** Source instance is stopped and, as far as can be determined without source-account credentials, safe to terminate — but do that from the source account directly, not through either Terraform stack (see Corrections). |
| IAM / OIDC for CI | Not checked (no reason to — GitHub Actions doesn't need source-account IAM) | GitHub OIDC provider (`token.actions.githubusercontent.com`) + roles for the mobile-release runner exist and are in active use | **Migrated.** |
| DNS zones | `hashpass.tech` (43 records), `hashpass.club` (11 records, includes MX/DKIM/DMARC/autoconfig — live email), `hashpass.lat` (5 records, includes unrelated `blockchainsummit.hashpass.lat`/`-dev` CNAMEs), `hashpass.info` (9 records, also live email — **not mentioned anywhere in the original migration docs, needs its own ownership check**) | Zones exist for `hashpass.tech` (43 records — **matches source exactly**), `hashpass.club` (2 records only), `hashpass.lat` (2 records only). **No `hashpass.info` zone in target at all.** | **Out of scope per the decision above**, but noting for accuracy: `hashpass.tech`'s target zone is fully in sync; `.club`/`.lat` target zones are stale/incomplete copies (fine to ignore or delete since zone hosting isn't moving); `hashpass.info` was never provisioned in target and isn't referenced by any doc — needs someone to confirm it's still a real, owned domain before deciding anything. |

## Corrections to prior documentation

Found while auditing, none of these were previously accurate:

- **The mobile-release Terraform stack most people would reach for was wrong.** `packages/infra/terraform/stacks/mobile-release` (no suffix) tracked the *source*-account instance (`i-0a2e763270ffd2b62`) and its `pnpm run infra:mobile-release:*` npm scripts pointed at it by default — even though the real runner has been on `mobile-release-target` (target account) for a while. Fixed 2026-07-28: renamed the stale stack to `mobile-release-legacy-source-account` with a warning README, repointed the npm scripts at `mobile-release-target`.
- **`mobile-release-target`'s own committed `terraform.tfvars.example` doesn't match what's actually deployed.** A real `terraform plan` against it (2026-07-28) previewed 15 resources destroyed/recreated (IAM roles, security group, CloudWatch alarms/dashboard all get renamed). Never applied. Whoever originally deployed this stack used different variable values than what's checked in — those need to be recovered/documented before this stack is safe to `apply` again for anything.
- **Amplify app `bsl2025.hashpass.tech`** (`d3ja863334bedw`, `us-east-2`) still exists in the source account and isn't mentioned in either prior doc. Needs investigation — likely a legacy leftover from before BSL moved to SST, candidate for removal once confirmed unused.
- **Two source-account CodeBuild projects, `hashpass-infra-production-build` and `hashpass-infra-dev-build`, have zero build history** (`us-east-2`) — appear to be unused scaffolding, not referenced by current docs. Candidate for removal once confirmed.
- **Two target-account CodeBuild projects look like one-off diagnostics**: `hashpass-arm-probe-1782856224`, `hashpass-lambda-probe-1782856067`. Low priority, but worth cleaning up.

## Constraints

- Do not delete, detach, or disable source-account resources before the target replacement is proven.
- Prefer Terraform, SST, or scripted AWS APIs over console-only changes.
- Keep account-specific values explicit in docs and scripts.
- Make every step reversible without requiring a full rebuild of the source account.
- Nobody currently has AWS credentials configured for the source account in this repo's `.env`/CLI profiles for *scripted* automation — the `default` CLI profile happens to authenticate to it (confirmed 2026-07-28), which is how this audit was possible, but that's incidental, not a documented/intentional setup. Don't assume it'll still be true later.

## Next Steps (in priority order)

1. **Decide the BSL Terraform path's fate.** Either finish the GitHub handshake so `bsl-hashpass-dev`/`bsl-hashpass-prod` pipelines exist in target and actually deploy, or formally drop this Terraform-managed CodeBuild/CodePipeline approach in favor of the SST Console autodeploy path CLAUDE.md already documents as BSL's real deploy mechanism today. Doing both indefinitely is redundant.
2. **Confirm `hashpass.info` ownership and purpose.** It's live (real email records) but absent from every migration doc. Find out if it's still wanted; if so, decide whether it needs a target-account zone at all given the DNS-stays-on-source decision (probably not — just document it as intentionally source-only, like the others).
3. **Reconcile `.club`/`.lat` target hosted zone records or delete them.** Since DNS zone hosting isn't moving, these incomplete 2-record target zones serve no purpose as-is — either finish syncing them (if there's a reason to keep target copies) or remove them to reduce confusion.
4. **Recover or rebuild `mobile-release-target`'s real variable values** before anyone applies that stack again — compare against the live resources (VPC/subnet/security-group/IAM names already visible in state) to reconstruct a correct `terraform.tfvars`.
5. **Decide the fate of confirmed-orphaned source-account resources** once someone with source-account access can verify safety: EC2 `i-0a2e763270ffd2b62` (stopped Android runner, superseded), Amplify app `bsl2025.hashpass.tech`, CodeBuild `hashpass-infra-production-build`/`hashpass-infra-dev-build`. None of these were touched by this audit — read-only checks only.
6. **Clean up target-account diagnostic CodeBuild projects** (`hashpass-arm-probe-*`, `hashpass-lambda-probe-*`) once confirmed no longer needed.

## Rollback Strategy

- Re-point DNS back to the source account if the target stack fails validation. (Moot for the pieces where DNS is staying on source anyway — this only applies if `hashpass.tech`'s CloudFront distribution itself is ever moved to target.)
- Leave the source Amplify app, pipelines, and EC2 runner intact until the new stack is stable.
- Keep target resources deployed but idle during validation so rollback is a traffic flip, not a rebuild.
- Destroy target resources only after the source account is confirmed stable and the migration is formally closed.

## Acceptance Criteria

- [x] The migration playbook exists in docs and includes a rollback section.
- [x] The docs navigation exposes the migration playbook.
- [x] Target-account infrastructure is provisioned without impacting the source account, for: API/Lambda, Android runner, web static site.
- [ ] BSL's Terraform-managed pipeline path is either completed in target or formally retired in favor of SST Console autodeploy.
- [ ] `hashpass.info`'s ownership/purpose is confirmed and documented.
- [ ] Orphaned source-account resources (old runner, old Amplify app, unused CodeBuild projects) are either explained or decommissioned by someone with source-account access.
- [ ] `mobile-release-target`'s Terraform state has real, correct variable values recorded so it's safe to apply again.
- Rollback to the source account is a documented, low-friction process. (Still true for web/API/runner; DNS rollback no longer applies since DNS isn't moving.)
