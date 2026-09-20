# Adopt a patched Node 24 baseline

**Priority:** High
**Status:** Implemented locally — Node 24.21.0 baseline; production release and remote runner validation pending
**Requested:** 2026-09-20, alongside the wallet implementation

User requested Node v24.14.1 as the system-wide/project baseline and asked whether
it is safe. The current shell and NVM default already use v24.14.1. Root and Lambda
package engines plus 13 setup-node steps across 11 workflows still pin v22.22.2.
No application release version should change as part of this runtime upgrade.

## Security decision

Do not describe v24.14.1 as security-current. Node's July 29, 2026 advisory fixes
high-severity HTTP/2 and permission-model defects in v24.18.1. The release index
and release notes identify v24.21.0 (2026-09-08) as current Node 24 LTS. Recommended
baseline: v24.21.0. Asked the user whether to use current patched 24 or their exact
requested version. Do not silently pin an older vulnerable patch.

Sources:
- https://nodejs.org/en/blog/vulnerability/july-2026-security-releases
- https://nodejs.org/en/blog/release/v24.21.0
- https://expo.dev/changelog/sdk-53 (minimum recommendation Node 20, not a Node 24 certification)
- https://aws.amazon.com/about-aws/whats-new/2025/11/aws-lambda-nodejs-24/

## Steps

- [x] Inventory local default, engines and CI pins; identify separate cloud runtimes.
- [x] Check official Node security status, Expo minimum and Lambda Node 24 support.
- [x] Run wallet crypto tests (27), app/regression tests (51) and changed-file typecheck on v24.14.1.
- [x] Complete SDK/links API tests and actual Expo Metro web/SSR compilation on v24.14.1 (24 SDK tests, 45 links API tests, HTTP 200 wallet route).
- [x] Select patched baseline; install without removing older rollback runtimes.
- [x] Align `.nvmrc`, `.node-version`, private package engines, CI and EAS pins.
- [x] Align buildspecs, managed-runtime IaC and local shell default; test runtime-sensitive native dependencies.
- [x] Verify lockfile install, tests/builds on final pinned patch; document untested platforms/services.
- [ ] Deploy through existing release process only when requested; managed Lambda uses `nodejs24.x` rather than an exact patch pin.

Changing this account's NVM default does not upgrade systemd services, containers,
other OS users or remote CI runners. Inventory those separately and report actual
scope. Do not rewrite OS-managed `/usr/bin/node` or silently replace vendor-managed
container runtimes. No AWS mutation is authorized by this local baseline task.

Root installed dependency engine ranges accept v24.14.1, and a native Sharp PNG
operation passes. Android/Hermes, EAS builds and deployed Lambda have not been
validated. Expo runs on Node during build; the native app runtime is Hermes.

## Patched-candidate validation

Installed v24.21.0 alongside existing versions through NVM; downloaded archive
checksum verified. On that version: 27 wallet crypto tests, 53 app/Metro regression
tests, 45 links-API tests and 24 SDK tests pass. Whole-workspace typecheck now
reports Framer Motion `className` errors in concurrently edited
`HowItWorks.web.tsx`; rerunning on v24.14.1 reproduces those same errors. Do not
attribute them to the new runtime or claim the entire current workspace passes.

NVM's default alias was subsequently observed as 24.21.0, while the active tool
shell still reports 24.14.1; project/CI pins remain unchanged pending baseline
selection. No old Node installation was removed. The current local dev stack was
restarted with its original v24.14.1 runtime to pick up the wallet Metro fixes.

Patched-runtime web check: restarted the local stack with v24.21.0 and `CI=1`
(non-watching Metro validation mode). Its web/SSR build succeeds and the wallet
route returns HTTP 200 on port 8081. V8 rejected an older Metro cache and rebuilt
it. Normal watch-mode startup still needs a clean follow-up check; do not claim
that non-watching compilation verifies development hot reload.

## Authorized baseline implementation

User confirmed adopting the recommended new stable version. Added `.nvmrc` and
`.node-version` at 24.21.0; root engines match. All 13 setup-node steps across 11
workflows now read `.nvmrc`; all EAS build profiles pin 24.21.0. Added a dependency-
free preinstall/`check:node` guard for runtime and configuration drift. CodeBuild
selects Node 24 and installs the exact version with `n`; EC2 bootstrap templates
install checksum-verified official 24.21.0 binaries, including upgrades from an
older installed Node. Lambda IaC/scripts now select `nodejs24.x`, its package
engine accepts managed 24.x patch updates, and the links API bundles for node24.

Set the local user's NVM default to 24.21.0 and enabled Corepack/pnpm 9.15.5 within
that installation. A clean `nvm exec` initially lacked pnpm; the shim fixes that.
No application release version changed; consumer SDK engine ranges are preserved.

Native dependency reinstall exposed an already-patched Expo Router tree; forced
locked reinstall repaired it. Two Puppeteer copies then raced downloading the
same browser archive. Retrying installation with serialized lifecycle scripts.
The Lambda node24 bundle succeeds. Workflow/buildspec YAML (23 files) and both
bootstrap shell templates parse successfully. Normal-watch Metro under Node
24.21.0 also compiles and serves the wallet route (HTTP 200).

## Final local validation

- `pnpm check:node` passes; direct execution on v24.14.1 fails as intended.
- Frozen lockfile install completes, including native lifecycle scripts. Used
  `PUPPETEER_SKIP_DOWNLOAD=true` locally after transitive Puppeteer downloads
  produced missing/corrupt browser archives; system Chrome remains available.
  This environment override is not committed or applied to CI globally.
- Final 53 app/Metro/Android regression tests pass after dependency patching.
  Wallet crypto tests: 27 pass; SDK: 24 pass; SDK CLI: 14 pass; links API: 45 pass.
  The links API's node24 Lambda bundle builds successfully.
- Native SQLite in-memory query, Argon2 hash/verify and Sharp image encode pass.
- Configuration YAML parses; bootstrap shell syntax validates; no previous Node
  20/22 pins remain in active tracked runtime configuration. Public SDK consumer
  compatibility ranges and archived historical documents remain intentionally
  separate from the project build/runtime baseline.
- Normal-watch Metro on v24.21.0 compiles web/SSR and serves the wallet route with
  HTTP 200. Post-install route recheck is recorded below.
- Whole-workspace typecheck remains affected by unrelated, concurrently edited
  `HowItWorks.web.tsx` Framer Motion `className` errors, also seen on v24.14.1.
  Wallet package typecheck passes. Do not report whole-workspace types as green.
- No application version bump, commit, push, AWS mutation, production deployment
  or Android/EAS build was performed. Already deployed Lambda functions/EC2
  runners still need the normal deployment process to receive these IaC changes.

User-facing instructions and patch-upgrade procedure:
`packages/tools/NODE_RUNTIME.md`. This OS user's NVM default and repository pins
are 24.21.0; other users, systemd services and vendor containers are not implicitly
upgraded by NVM. Existing shells can select the pinned runtime with `nvm use`.

A clean NVM switch now resolves pnpm 9.15.5 and passes `pnpm check:node`.
Terraform formatting checks also pass. The currently running port-8081 Metro
process was independently verified to execute the v24.21.0 Node binary.

Final post-install verification: `/dashboard/wallet` on localhost:8081 returns
HTTP 200 under the verified Node v24.21.0 process. Runtime migration configuration
and local validation are complete; release/deployed-runtime checks remain separate.
