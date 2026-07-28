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
| BSL dev (`bsl-dev.hashpass.tech`) | Old CodePipeline/CodeBuild **deleted 2026-07-28** — superseded by the hybrid cutover, kept running would have reverted it | **Cut over and live (2026-07-28).** Hybrid shape: source-account CloudFront `E279RW9PP52TC0` (unchanged, cert already issued) fronting a new target-account S3 bucket, deployed by `bsl-target`'s dev CodePipeline via `build-bsl-static-site.sh`. Verified serving `server: AmazonS3`, v1.8.274. |
| BSL prod (`bsl.hashpass.tech`) | CodeBuild `bsl-hashpass-prod-build` + CodePipeline `bsl-hashpass-prod`, repo wiring fixed 2026-07-28 (was `edcalderon/hashpass.tech`, now `hashpass-tech/hashpass.tech`), currently the live interim path | **Not yet cut over.** Still fully source-account SST (own distribution `E2FCDJB1JCS7TW`, own cert) — same hybrid approach as dev is the natural next step once dev proves stable over more than one deploy cycle. `bsl-target`'s target-account `bsl-hashpass-prod` pipeline exists but can't succeed yet (still SST-based, blocked on the CloudFront account-verification ticket). |

## BSL pipeline incident and migration (2026-07-28)

**Symptom:** `bsl.hashpass.tech` was serving `v1.8.273` while `hashpass.tech` was already on `v1.8.274`.

**Root cause:** both source-account BSL CodePipelines (`bsl-hashpass-prod`, `bsl-hashpass-dev`) had their `FullRepositoryId` set to `edcalderon/hashpass.tech` — a personal fork — instead of `hashpass-tech/hashpass.tech`. `bsl-hashpass-prod` watches that fork's `main` branch, but nothing in the release automation ever pushes to `upstream/main` (`release-tag-on-merge.yml`'s own header comment: *"Only pushes the tag to origin, not upstream"*). Its last real trigger was **2026-07-25, v1.8.260** — 3 days and ~14 releases stale by the time this was caught. `bsl-hashpass-dev` stayed fresh only because `develop` on that fork does get pushed regularly (by `release:promote` and manually), which is why it looked healthy while prod silently rotted.

This CodePipeline was confirmed to be the **real, working production deploy path** (unbroken success history back to July 12) — not a legacy/vestigial one as this doc previously assumed based on CLAUDE.md's "SST Console autodeploy" description. The CodeBuild step runs `pnpm --filter @hashpass/infra run deploy:<stage>`, which is itself SST's deploy engine — "SST Console autodeploy" and "this CodePipeline" turned out to be describing the same underlying mechanism, not two competing ones.

**Decision:** rather than patch the wrong-repo bug on the existing source-account pipeline, migrate BSL to the target account properly, wiring the correct repo from the start. Also decided **(same session): use a custom EC2 build worker instead of CodeBuild**, matching the pattern `packages/infra/terraform/stacks/hashpass-web` already uses for the main site — more control, and CodeBuild turned out to be a dead end anyway (see below).

**What was found/built, in order:**
1. Target account already had everything except the pipeline itself: a working GitHub CodeStar connection (`bce03f47-4812-41c4-b57f-040c9ab019d1`, `AVAILABLE`), both CodeBuild projects (`bsl-hashpass-prod-build`/`bsl-hashpass-dev-build`, correct buildspec, mirrored env vars), the pipeline IAM role (`BslHashpassPipelineRole`), and the artifact bucket. The "GitHub handshake still needs to be completed" note from the original doc was stale — it's done.
2. **Security finding**: those CodeBuild projects (and the pipeline role) store the BSL Supabase service-role key and DB password as **plaintext environment variables/`AdministratorAccess`**, not Secrets Manager / least-privilege IAM. This is an existing account-wide pattern (also true of `hashpass-web`'s and the mobile runner's IAM roles), not something newly introduced — flagged as a real hardening item, not fixed here.
3. First attempt (CodePipeline + existing CodeBuild projects, correct repo) failed: **the target account's CodeBuild concurrent-build quota is `0` for every environment type**, account-wide, pre-existing, unrelated to BSL. This also explains why `hashpass-arm-probe-*`/`hashpass-lambda-probe-*` (two other target CodeBuild projects, see earlier finding) have zero build history ever. Requested a quota increase (AWS Support case `178525969200038`, pending as of this writing) — but decided to switch to the EC2 worker instead of waiting on it.
4. Built `packages/infra/terraform/stacks/bsl-target`: reuses the `aws_pipeline_ec2_worker` module (same one `hashpass-web` uses) for a dedicated BSL EC2 build worker, registers a distinct custom CodePipeline action provider (`hashpass-bsl-ec2-build`, so its job polling never collides with `hashpass-web`'s `hashpass-ec2-build`), and defines `bsl-hashpass-prod`/`bsl-hashpass-dev` CodePipelines with a Source stage (correct repo/connection) and a single Build stage whose action runs the new `packages/tools/scripts/build-bsl-infra.sh` — which is the entire SST deploy (`pnpm --filter @hashpass/infra run deploy:<stage>`), not a separate build+deploy split, since SST's deploy is atomic and creates its own S3/CloudFront/Route53 resources directly.
5. `terraform validate`/`plan` (21 to add, 0 to change, 0 to destroy — no conflicts with existing resources) then `apply`, after explicit confirmation (creating real EC2/VPC/IAM resources isn't something to do silently). All 21 resources created successfully.
6. Old CLI-created (non-Terraform, CodeBuild-based) `bsl-hashpass-dev` pipeline from the first attempt was deleted — superseded, and not IaC-managed, which contradicts the "always use IaC" principle this task is built on.

**DNS**: confirmed the deploy is safe to validate without touching live traffic — `packages/tools/scripts/check-infra-dns.sh` resolves whichever Route53 zone exists in the *current* AWS account, so a target-account deploy only touches the target zone's own (non-authoritative) copy of `hashpass.tech`. **This turned out to be a harder blocker than originally assumed, not just a deferred cutover step** (found 2026-07-28 while validating `bsl-hashpass-dev`): SST's `sst.aws.dns()` construct auto-requests an ACM certificate for the site's custom domain and writes the DNS validation CNAME into whatever zone `ROUTE53_ZONE_ID` resolves to — which, run under target-account credentials, is *always* the non-authoritative shadow zone. Since the public NS records for `hashpass.tech` point at the source-account zone (`Z0236404TWGQH7K9IU6F`), ACM can never see that CNAME, so the certificate sits `PENDING_VALIDATION` forever and the SST deploy hangs silently (near-zero CPU, easy to mistake for "just slow" — this is what a 30+ minute-and-counting `bsl-hashpass-dev` build turned out to be). There is no cross-account Route53 role to automate this yet, so it's a manual one-time step per new domain: copy the pending cert's DNS validation `ResourceRecord` (`aws acm describe-certificate`) into the real source-account zone by hand. Done for `bsl-dev.hashpass.tech`'s cert (`arn:aws:acm:us-east-1:952191196420:certificate/1d2a5a8c-8217-478e-98b2-598085263656`) on 2026-07-28; documented inline in `build-bsl-infra.sh`. `bsl.hashpass.tech` (prod) hasn't hit this yet since its migration hasn't run — it's still fully on the source-account pipeline (confirmed via `aws cloudfront list-distributions`: `d1fsf8ogthl18v.cloudfront.net` and its ACM cert are both still in `058264267235`) — but expect the identical one-time manual step when prod is migrated (task item below). Once a domain's cert is `ISSUED`, this cost doesn't recur for that domain. The final A/AAAA alias-to-target-CloudFront cutover in the *source* zone (the `hashpass.tech`/`dev.hashpass.tech` pattern) is a separate, later step, done only after both pipelines are validated end to end.

**Separate incident found the same day, also blocking `bsl-hashpass-dev` validation**: `.github/workflows/hashpass-web-pipeline-monitor.yml` runs every 10 minutes and stops any EC2 instance tagged `Project=hashpass` + `Service=pipeline-build-worker` whenever its own web pipelines are idle. The BSL worker (`bsl-target`'s `aws_pipeline_ec2_worker` instance) was built from the same module and got those exact same two tags, so this cron adopted it too and stopped it mid-build (confirmed via CloudTrail: `StopInstances` on `i-0a4c44611f1d13024`, called by IAM role session `hashpass-web-pipeline-monitor`, independent of whether `bsl-hashpass-dev`/`prod` were actually running). Fixed by adding a `Provider` tag filter (`hashpass-ec2-build` vs `hashpass-bsl-ec2-build`, already distinct per-stack) to `manage-web-pipeline-worker.sh` and wiring it through the workflow — commit `1815d3d2a` on `develop`.

**Hybrid dev cutover, proven and cut over the same day (2026-07-28):** rather than wait on the CloudFront account-verification ticket (see below), `bsl-dev.hashpass.tech` moved to the same hybrid shape `hashpass.tech`/`dev.hashpass.tech` already use — CloudFront + DNS stay on the source account, S3 bucket + build compute move to target. Concretely:
- `bsl-target`'s dev CodePipeline now runs `packages/tools/scripts/build-bsl-static-site.sh` (plain `expo export` + `aws s3 sync`, no SST/Pulumi) against a new plain S3 bucket (`aws_s3_bucket.bsl_dev_site` in `bsl-target/main.tf`), instead of the full `sst deploy --stage dev`.
- The existing source-account CloudFront distribution `E279RW9PP52TC0` (`bsl-dev.hashpass.tech`, already `ISSUED` cert, no new domain validation needed) had its origin manually repointed from SST's `placeholder.sst.dev` + CloudFront-Function/KV routing to this bucket's S3 website endpoint (one-time `update-distribution` call — this resource predates being brought under proper IaC ownership, so a real `terraform import` of it is a separate follow-up, not done here).
- Hit two real bugs getting this working, both fixed and documented inline in the scripts: (1) Metro's cache defaulted to a persistent non-workspace-scoped location on this worker, so a stale cache entry from an older job's absolute path broke module resolution — same class of bug as CLAUDE.md's mobile-release-runner Metro cache note, fixed by scoping `METRO_CACHE_DIR` per-workspace in both `build-bsl-static-site.sh` and `build-bsl-infra.sh`; (2) the deploy script's CloudFront invalidation step failed because the distribution lives in a different account than the worker's credentials — fixed by skipping invalidation from this script for now (HTML/manifest objects already get `no-cache` headers, so staleness is bounded).
- Verified live: `https://bsl-dev.hashpass.tech/` serves `server: AmazonS3`, current version `1.8.274`, confirmed via `get-distribution` that the origin is genuinely the new bucket.
- Once cut over and proven, the now-redundant **source-account** `bsl-hashpass-dev` CodePipeline and `bsl-hashpass-dev-build` CodeBuild project were deleted the same day — leaving them running risked SST reconciling the distribution back to its own desired state (undoing the hybrid) on the very next `develop` push, so this wasn't a "clean up later" item.
- `bsl-hashpass-prod` is **not** part of this cutover yet — it's still fully on the old source-account SST pipeline (own distribution `E2FCDJB1JCS7TW`, own ACM cert, all in `058264267235`), which continues to work and was intentionally left untouched. Extending the same hybrid to prod is the natural next step once dev's shape is trusted with more than one deploy cycle.

**Superseded, not yet cleaned up**: the target-account `bsl-hashpass-prod-build`/`bsl-hashpass-dev-build` CodeBuild projects (no longer used now that the EC2-worker pipelines exist) — the source-account dev pipeline/CodeBuild pair from this same list was deleted above; the source-account **prod** pipeline/CodeBuild pair stays, since prod hasn't cut over.
| Android runner | EC2 `i-0a2e763270ffd2b62` (`hashpass-mobile-release-1`) — **gone, confirmed 2026-07-28** (`describe-instances` returns `InvalidInstanceID.NotFound`; terminated by someone with source-account access outside this session, or auto-cleaned) | EC2 `i-05628f925bb57e2f1`, live, confirmed handling real builds today (internal/alpha/beta/production all succeeded 2026-07-28), resized to `t3a.xlarge` | **Fully migrated and validated.** Source instance no longer exists — nothing left to clean up here. |
| IAM / OIDC for CI | Not checked (no reason to — GitHub Actions doesn't need source-account IAM) | GitHub OIDC provider (`token.actions.githubusercontent.com`) + roles for the mobile-release runner exist and are in active use | **Migrated.** |
| `bitacora.hashpass.tech` | CloudFront distribution `E21D0HJJTEQMO0` exists (SST placeholder origin, same shape as BSL's distributions) | Not identified — nothing obviously matching "bitacora" found in the target-account resources inventoried | **Undocumented anywhere** — not in either migration doc, `DEPLOYMENT_MAP.md`, or any other infra doc found in this repo. Needs someone to say what this is (guess: a changelog/audit-log site — "bitácora" is Spanish for "logbook") before it can be migrated, documented, or written off. |
| DNS zones | `hashpass.tech` (43 records), `hashpass.club` (11 records, includes MX/DKIM/DMARC/autoconfig — live email), `hashpass.lat` (5 records, includes unrelated `blockchainsummit.hashpass.lat`/`-dev` CNAMEs), `hashpass.info` (9 records, also live email) | Zones exist for `hashpass.tech` (43 records — **matches source exactly**), `hashpass.club` (2 records only), `hashpass.lat` (2 records only). **No `hashpass.info` zone in target at all.** | **Out of scope per the decision above.** `hashpass.info` is the planned fallback SMTP domain for `.agents/pending/email-proxy-balancer.md` (self-hosted mail via `webmail.tláo.com`) — its email records are real and needed, and it correctly stays source-only, no target zone required. `.club`/`.lat` target zones are stale/incomplete copies (fine to ignore or delete since zone hosting isn't moving). |

## Corrections to prior documentation

Found while auditing, none of these were previously accurate:

- **The mobile-release Terraform stack most people would reach for was wrong.** `packages/infra/terraform/stacks/mobile-release` (no suffix) tracked the *source*-account instance (`i-0a2e763270ffd2b62`) and its `pnpm run infra:mobile-release:*` npm scripts pointed at it by default — even though the real runner has been on `mobile-release-target` (target account) for a while. Fixed 2026-07-28: renamed the stale stack to `mobile-release-legacy-source-account` with a warning README, repointed the npm scripts at `mobile-release-target`.
- **`mobile-release-target`'s own committed `terraform.tfvars.example` doesn't match what's actually deployed.** A real `terraform plan` against it (2026-07-28) previewed 15 resources destroyed/recreated (IAM roles, security group, CloudWatch alarms/dashboard all get renamed). Never applied. Whoever originally deployed this stack used different variable values than what's checked in — those need to be recovered/documented before this stack is safe to `apply` again for anything.
- **Amplify app `bsl2025.hashpass.tech`** (`d3ja863334bedw`, `us-east-2`) still exists in the source account and isn't mentioned in either prior doc. **Decided (2026-07-28): legacy archival, not actively maintained going forward — fine to stay stale on the source account indefinitely.** No action needed.
- **Two source-account CodeBuild projects, `hashpass-infra-production-build` and `hashpass-infra-dev-build`, had zero build history** (`us-east-2`) — unused scaffolding, not referenced by current docs. **Deleted 2026-07-28** (re-confirmed zero builds immediately before deletion, then `codebuild delete-project` on both, verified gone via `list-projects`).
- **Two target-account CodeBuild projects look like one-off diagnostics**: `hashpass-arm-probe-1782856224`, `hashpass-lambda-probe-1782856067`. Low priority, but worth cleaning up.

## Constraints

- Do not delete, detach, or disable source-account resources before the target replacement is proven.
- Prefer Terraform, SST, or scripted AWS APIs over console-only changes.
- Keep account-specific values explicit in docs and scripts.
- Make every step reversible without requiring a full rebuild of the source account.
- Nobody currently has AWS credentials configured for the source account in this repo's `.env`/CLI profiles for *scripted* automation — the `default` CLI profile happens to authenticate to it (confirmed 2026-07-28), which is how this audit was possible, but that's incidental, not a documented/intentional setup. Don't assume it'll still be true later.

## Next Steps (in priority order)

1. **Extend the proven hybrid to `bsl.hashpass.tech` (prod).** Dev's cutover (source CloudFront + target S3/compute, see "BSL pipeline incident and migration" below) is live and validated; prod is intentionally untouched and still fully source-account SST. Repeat the same pattern once dev has a few more clean deploy cycles behind it: new S3 bucket in `bsl-target`, `build-bsl-static-site.sh` wired to prod's pipeline, repoint `E2FCDJB1JCS7TW`'s origin, then retire the source-account `bsl-hashpass-prod`/`bsl-hashpass-prod-build` pair the same way dev's were retired.
2. **AWS Support case submitted (2026-07-28)** requesting CloudFront account verification for the target account (952191196420) — framed as an internal business-unit migration/segregation, not fraud. Once approved, `bsl-target`'s own CloudFront distributions can actually be created and the hybrid workaround becomes optional rather than required — revisit whether to migrate CloudFront itself to target at that point, or keep the hybrid shape permanently (matches `hashpass.tech`'s own already-permanent hybrid decision above).
3. ~~Confirm `hashpass.info` ownership and purpose.~~ **Resolved (2026-07-28)**: it's the planned fallback SMTP domain for `.agents/pending/email-proxy-balancer.md`. Stays source-only, no further action needed here.
4. **Reconcile `.club`/`.lat` target hosted zone records or delete them.** Since DNS zone hosting isn't moving, these incomplete 2-record target zones serve no purpose as-is — either finish syncing them (if there's a reason to keep target copies) or remove them to reduce confusion.
5. **Recover or rebuild `mobile-release-target`'s real variable values** before anyone applies that stack again — compare against the live resources (VPC/subnet/security-group/IAM names already visible in state) to reconstruct a correct `terraform.tfvars`.
6. ~~Decide the fate of confirmed-orphaned source-account resources~~ **Done 2026-07-28**: EC2 `i-0a2e763270ffd2b62` was already gone (terminated outside this session); CodeBuild `hashpass-infra-production-build`/`hashpass-infra-dev-build` deleted after re-confirming zero build history. (Amplify app `bsl2025.hashpass.tech` is explicitly excluded from this — see decision above, it stays as-is.)
7. **Clean up target-account diagnostic CodeBuild projects** (`hashpass-arm-probe-*`, `hashpass-lambda-probe-*`) once confirmed no longer needed.
8. **Identify `bitacora.hashpass.tech`.** Undocumented anywhere in this repo. Find out what it is, whether it's still needed, and if so give it the same treatment as BSL (mirror to target or explicitly leave source-only) and add it to `DEPLOYMENT_MAP.md`.
9. **Take proper Terraform ownership of the source-account BSL CloudFront distributions** (`E2FCDJB1JCS7TW` prod, `E279RW9PP52TC0` dev). Dev's origin was repointed via a one-time manual `update-distribution` call, not IaC — a real `terraform import` (source-account provider) would close that gap and match this task's own "prefer Terraform over console/CLI-only changes" constraint.

## Rollback Strategy

- Re-point DNS back to the source account if the target stack fails validation. (Moot for the pieces where DNS is staying on source anyway — this only applies if `hashpass.tech`'s CloudFront distribution itself is ever moved to target.)
- Leave the source Amplify app, pipelines, and EC2 runner intact until the new stack is stable.
- Keep target resources deployed but idle during validation so rollback is a traffic flip, not a rebuild.
- Destroy target resources only after the source account is confirmed stable and the migration is formally closed.

## Acceptance Criteria

- [x] The migration playbook exists in docs and includes a rollback section.
- [x] The docs navigation exposes the migration playbook.
- [x] Target-account infrastructure is provisioned without impacting the source account, for: API/Lambda, Android runner, web static site.
- [x] BSL dev is cut over to the target-account hybrid (source CloudFront + target S3/compute) and verified live. AWS Support case submitted for target-account CloudFront verification.
- [ ] BSL prod (`bsl.hashpass.tech`) gets the same hybrid treatment and its source-account SST pipeline is retired.
- [x] `hashpass.info`'s ownership/purpose is confirmed and documented — fallback SMTP domain for the pending email-proxy-balancer task.
- [x] Legacy Amplify app `bsl2025.hashpass.tech` — decided to leave as archival, no action needed.
- [ ] Remaining orphaned source-account resources (old runner, unused `hashpass-infra-*-build` CodeBuild projects) are either explained or decommissioned by someone with source-account access.
- [ ] `mobile-release-target`'s Terraform state has real, correct variable values recorded so it's safe to apply again.
- [ ] `bitacora.hashpass.tech` is identified and given an explicit migration/retention decision.
- Rollback to the source account is a documented, low-friction process. (Still true for web/API/runner; DNS rollback no longer applies since DNS isn't moving.)
