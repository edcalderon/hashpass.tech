# Release Flow Automation — Merge-Triggered Tag & Sync

**Status:** 🟡 In progress — tag protection live, release.js updated, workflow built, blocked on RELEASE_AUTOMATION_TOKEN PAT (see Implementation Log)
**Priority:** High
**Created:** 2026-07-13
**Updated:** 2026-07-13

---

## Overview

Collapse the current manual `release:promote` → wait for approval → manually
run `release:patch` in a second worktree → manually sync `develop` twice
sequence into: **one human checkpoint (codeowner PR approval), everything
else automatic.** The version bump and changelog move *into* the promotion
PR itself; a merge-triggered CI workflow does the tagging and `develop`
sync that a human currently has to remember to run by hand afterward.

Goals, in priority order: **traceability** (one PR = one version = one tag =
one set of deploys, all sharing a commit SHA), **maintainability** (fewer
manual steps a human has to remember correctly), **reduced time-to-ship**
(the gap between "approved" and "live" becomes CI runtime, not "whenever
someone remembers to run the second script").

## Why Now

Session 2026-07-13 surfaced concrete evidence this is worth doing, not just
theoretical cleanup:

- Ran the documented manual flow (`release:promote` → approval → merge →
  manual sync → separate `main` worktree → `release:patch` → manual sync
  again) twice in one session to ship a mobile crash fix.
- **`CLAUDE.md` documented a step that was already automatic and wrong to
  repeat.** `.github/workflows/mobile-release-on-tag.yml` already
  auto-dispatches `mobile-android-release.yml` on every `v*.*.*` tag push —
  CLAUDE.md still said to run `gh workflow run mobile-android-release.yml`
  manually as step 6. Following the stale doc created a **duplicate
  workflow_dispatch run racing the auto-triggered one for the same Android
  version code** against Play Console's internal track. Had to cancel the
  duplicate (`gh run cancel`, required explicit user authorization since the
  auto-mode classifier blocks unrequested CI-run cancellation). Fixed in
  `CLAUDE.md` (commit `ab1bb3019`) — **`AGENTS.md`'s Deployment Command
  Contract step 9 still has the same stale "trigger the Android release
  workflow" instruction and needs the identical fix** (see Related Doc Fixes
  below).
- Hit a second, unrelated footgun in the same session: a dedicated `main`
  git worktree (`hashpass.tech-main`) exists alongside the primary
  `develop` checkout specifically so both branches can be worked on without
  `git checkout` conflicts — `git checkout main` fails from the primary
  directory with `fatal: 'main' is already used by worktree`. Not itself
  something this task needs to fix, but it's one more piece of tribal
  knowledge the current manual flow depends on getting right by hand.
- Both incidents are the same root shape: **a step that should be
  structurally impossible to get wrong is instead "documented, and a human
  (or agent) has to remember it correctly every time."** That's exactly what
  this task removes.

## Implementation Log

Started 2026-07-13. Two additional discoveries made while implementing,
both fixed or documented in place rather than deferred:

1. **`main`'s branch ruleset was configured but not enforced.** The `MAIN`
   ruleset (1 required approval, CodeQL, coverage ≥33%, code quality,
   Copilot review — everything CLAUDE.md describes) existed with
   `enforcement: "disabled"`, and the legacy branch-protection API confirmed
   `main` as literally unprotected. This explained why `release:patch`'s
   direct `git push origin main` always succeeded — nothing was enforcing
   the PR-only path at the GitHub level, despite the whole team process
   (and this task's own risk analysis) assuming it was. **Flipped to
   `enforcement: "active"` via `gh api ... rulesets/18627241 --method PUT
   --field enforcement=active`** (user-authorized). Also discovered
   `require_code_owner_review` is `false` on that ruleset even though
   `CODEOWNERS` exists (`* @edcalderon`) — any single approver currently
   satisfies the rule, not specifically the codeowner. Left as-is per
   explicit user decision 2026-07-13; revisit separately from this task.
   Added a second ruleset, `release-tags` (id `18897278`), target `tag`,
   pattern `refs/tags/v*.*.*`, rules `deletion` + `update`, no bypass
   actors — satisfies this task's tag-protection acceptance criterion.

   **Direct consequence:** enabling the ruleset immediately blocked
   `release:patch`'s direct push to `main` (any direct push to `main` now
   requires a PR — tags are unaffected, the ruleset targets the branch, not
   tags). This made finishing this task's workflow urgent rather than
   incremental — the old flow's final step no longer works at all until the
   new one replaces it.

2. **`release:promote`'s new version-bump step (below) verified safe by
   actually running it** (not just reading code): `pnpm exec versioning
   patch --branch-aware --target-branch main --no-commit --no-tag` run from
   a `develop` checkout correctly computed the same next-version as
   `resolvePromotionVersion`'s independent calculation, confirming
   `--target-branch` is genuinely branch-name-parameterized rather than
   requiring physical checkout on that branch. (It also surfaced a real,
   separate behavior: it refuses to write a changelog entry with "no
   documented changes" if nothing conventional-commit-worthy landed since
   the last release — a sensible guard, but a new failure mode for
   `release:promote` that didn't exist before; worth calling out in the
   cutover PR description.) Test was fully reversible — `--no-commit` never
   commits, so `git checkout -- .` cleanly discarded the trial write before
   anything real happened.

3. **The merge-triggered workflow cannot use the default `GITHUB_TOKEN` for
   its pushes.** GitHub's anti-recursion rule means pushes authenticated
   with the default `GITHUB_TOKEN` do not trigger other workflows' `on:
   push` listeners. Using it here would have silently broken
   `mobile-release-on-tag.yml`'s `push: tags: v*.*.*` trigger (the exact
   automation this session started by fixing) and `infra-deploy.yml`'s
   `push: branches: [develop]` trigger on the sync push. **Requires a
   fine-grained PAT**, stored as repo secret `RELEASE_AUTOMATION_TOKEN`,
   scoped to only `hashpass-tech/hashpass.tech` with only "Contents: Read
   and write" permission. This cannot be minted headlessly (GitHub requires
   interactive web-UI consent to create a PAT) — **blocked on a human
   action**: create the PAT at
   https://github.com/settings/personal-access-tokens/new (fine-grained,
   repository access limited to `hashpass-tech/hashpass.tech`, permission
   "Contents: Read and write"), then either paste it for `gh secret set
   RELEASE_AUTOMATION_TOKEN --repo hashpass-tech/hashpass.tech`, or set it
   directly in the repo's Settings → Secrets → Actions. The workflow
   (`.github/workflows/release-tag-on-merge.yml`) fails loudly at a
   preflight step if this secret is missing, rather than silently falling
   back to a token whose pushes wouldn't cascade.

## Current Flow (as-is)

Documented in `CLAUDE.md`'s Mobile Android Release Workflow section and
`AGENTS.md`'s Deployment Command Contract; verified by hand this session:

1. Commit fix on `develop`.
2. `npm run release:promote` on `develop` — pre-flight checks, commits any
   dirty release-prep files, pushes `develop`, opens `develop → main` PR.
   **Does not** bump version, write changelog, or tag.
3. CI runs on the PR (CodeQL, coverage ≥33%, Gitleaks, web smoke test, docs
   threshold check).
4. `@edcalderon` codeowner approves via GitHub UI (GitHub blocks
   self-approval by the PR author, so this cannot be scripted from the same
   `gh` identity that opened the PR).
5. Merge the PR.
6. `gh pr list --base main --state open` — confirm no straggler second
   promotion PR exists (guards the 2026-07-08 incident documented in
   `apps/docs/docs/reference/release/RELEASE_WORKFLOW.md`).
7. **Sync #1:** `git merge origin/main` on `develop`.
8. Switch to the `main` worktree, pull.
9. `npm run release:patch` on `main` — computes version, writes
   `CHANGELOG.md`, bumps ~12 files, commits `chore: release vX.Y.Z`, tags
   `vX.Y.Z`, pushes tag + commit directly to `main` (allowed — branch
   protection only gates the PR diff, not a direct push post-merge).
10. Tag push fires `mobile-release-on-tag.yml` (Android auto-build) and the
    existing push-to-`main` deploy pipelines (web, Lambda, `infra-deploy.yml`
    if paths match) automatically.
11. **Sync #2:** `git merge origin/main` on `develop` again, to pick up the
    release commit step 9 created that `develop` didn't have after step 7.

Steps 7 and 11 are the "syncing twice" problem. Step 11 is unavoidable under
the current design because step 9 creates new content on `main` *after*
step 7 already ran. Steps 8–9 (worktree switch, manual script run) are
pure human-memory surface area with no safety benefit — the codeowner
review in step 4 is the actual gate; running `release:patch` by hand adds
latency, not review.

## Target Flow (to-be)

1. Commit fix on `develop`.
2. `release:promote` (or its replacement) on `develop` now **also** runs the
   version-bump/changelog step and includes it as its own labeled commit
   within the same push — the PR diff a codeowner reviews *is* the release
   artifact, version bump included.
3. CI runs on the PR (unchanged).
4. Codeowner approves (unchanged — the one remaining human checkpoint).
5. Merge the PR.
6. **New:** a workflow triggered on `pull_request` `closed` with
   `merged == true` targeting `main`, filtered to promotion PRs (by source
   branch `develop` or an explicit label), automatically:
   - Tags `github.event.pull_request.merge_commit_sha` — **not** `main`'s
     live `HEAD` at execution time, to avoid a race if another merge lands
     in the gap between event and job start (see Security Considerations).
   - Pushes the tag (cascades into the already-automatic
     `mobile-release-on-tag.yml`, web deploy, Lambda deploy — unchanged).
   - Syncs `develop` from `main` (single fast-forward/pull; there is no
     step 9-equivalent creating *new* content after this, so one sync
     suffices).
7. Android build, web deploy, Lambda deploy proceed exactly as today
   (unaffected — they already react to the tag/push, not to who or what
   triggered it).

Net effect: steps 6 onward in the current flow (worktree switch, manual
`release:patch`, second sync, and — as of the `CLAUDE.md` fix — *not*
manually re-triggering Android) collapse into one CI job that fires the
instant the PR merges.

## Security & Risk Considerations

Enumerated 2026-07-13 before implementation; each needs a concrete answer
in the design, not just acknowledgment:

1. **Version-bump noise can hide a real change in review.** `release:patch`
   touches ~12 files (CHANGELOG, README, package.json, app.json, multiple
   version.ts/json, service worker). Keep the version-bump as its own
   clearly-labeled commit within the PR (not squashed with the code diff),
   so GitHub's per-commit view still isolates the actual code change.
2. **The promotion PR becomes the entire security perimeter.** Already true
   in practice today (`main` auto-deploys to web/Lambda on any push), but
   this makes it explicit — there is no other checkpoint between "approved"
   and "live" anywhere in the chain. Confirm reviewer diligence on this PR
   path is real, not a rubber stamp, before relying on it as the sole gate.
3. **Race on version/tag computation.** The tagging job must read
   `github.event.pull_request.merge_commit_sha` from the triggering event
   payload, never `main`'s `HEAD` at execution time — a second merge landing
   in the gap would otherwise tag the wrong commit or miscompute the next
   version.
4. **Silent partial failure.** Today a human watches `release:patch` run
   interactively and stops on error. In CI, a partial failure (tag pushed,
   `develop` sync push fails) needs explicit failure notification — a red X
   in the Actions tab is not sufficient, since nobody is watching by
   default.
5. **Duplicate-trigger risk — already hit this exact bug class this
   session** with the Android dispatch collision. The new workflow needs a
   `concurrency:` group (e.g. `release-${{ github.event.pull_request.number
   }}`) so a flaky webhook redelivery or re-run cannot produce two tags for
   one merge.
6. **Token scope.** The job needs `contents: write` to push a tag/commit and
   sync `develop`. Scope to exactly that — no broader PAT — and pin any
   third-party Actions it uses by commit SHA, not a mutable version tag.
7. **Tag protection.** Check whether GitHub's tag-protection rules are
   configured for `v*.*.*` on this repo. If not, anything else holding
   `contents: write` could create or overwrite a release tag outside this
   workflow. Recommend adding tag protection as part of this task, not
   after.

## Migration Plan

Staged and reversible — do not flip the switch in one commit. Each phase
should be independently mergeable and independently revertible.

1. **Design the workflow file** (`.github/workflows/release-tag-on-merge.yml`
   or similar) and the `release.js` changes as a proposal doc first —
   confirm the exact split of responsibilities between what moves into
   `release:promote` (version bump + changelog, now inside the PR) and what
   the new merge-triggered job does (tag + push + sync only). Get sign-off
   on the design before writing workflow YAML.
2. **Add tag protection rules** for `v*.*.*` (Security Consideration 7) —
   independent of everything else, do this first since it's pure risk
   reduction with no behavior change.
3. **Modify `release:promote`** to compute and commit the version
   bump/changelog as a separate labeled commit on the promotion branch,
   *before* opening the PR. Verify the PR diff view still cleanly separates
   this commit from the code changes.
4. **Build the merge-triggered workflow** in a disabled/dry-run mode first
   (e.g., gated behind a workflow_dispatch-only test path, or targeting a
   scratch branch) to validate the tag-on-merge-commit-sha logic and the
   `develop` sync without touching a real release.
5. **Dry-run against a real low-stakes release** (a docs-only or
   patch-level promotion) with a human watching closely before trusting it
   unattended — do not go straight from "works in a test branch" to "no
   supervision."
6. **Cut over**: remove the now-redundant manual `release:patch`-on-`main`
   step from `CLAUDE.md`'s documented flow, same way the Android
   manual-trigger step was corrected this session.
7. **Fix the related stale doc** (see below) in the same pass so the two
   release docs (`CLAUDE.md`, `AGENTS.md`) stay in sync with each other and
   with reality — this session's incident happened specifically because
   they didn't.

## Related Doc Fixes (do alongside this task, not deferred)

- `AGENTS.md`'s Deployment Command Contract, step 9, still says "Trigger the
  Android release workflow from the new version tag" as a manual action.
  This is the same stale instruction `CLAUDE.md` had (fixed in commit
  `ab1bb3019`) — `AGENTS.md` needs the identical correction: the tag push
  already triggers it via `mobile-release-on-tag.yml`. Fix this
  independently of (and before) the rest of this task, since it's a live
  landmine for the next agent session regardless of whether the rest of
  this migration happens.

## Files Likely To Change

| File | Change |
|---|---|
| `packages/tools/scripts/release.js` | Split promote/patch responsibilities: version bump + changelog move into promote; patch becomes tag-only (or is retired in favor of the new workflow) |
| `.github/workflows/release-tag-on-merge.yml` (new) | Merge-triggered tag + push + `develop` sync, with `concurrency:` guard and merge-commit-sha pinning |
| `CLAUDE.md` | Update Mobile Android Release Workflow and Version Management sections to describe the new flow once implemented |
| `AGENTS.md` | Fix stale step 9 (manual Android trigger) now; update the full Deployment Command Contract once the merge-triggered flow lands |
| `apps/docs/docs/reference/release/RELEASE_WORKFLOW.md` | Update the Canonical Order checklist to match the new flow |
| GitHub repo settings (tag protection) | ✅ Done — `release-tags` ruleset, id `18897278` |
| GitHub repo settings (`main` ruleset) | ✅ Done — flipped `MAIN` ruleset (id `18627241`) from `disabled` to `active` |
| GitHub repo secrets | **Blocked on human action** — needs `RELEASE_AUTOMATION_TOKEN` (fine-grained PAT, this repo only, Contents read/write). See Implementation Log item 3. |

## Rollback Strategy

- Each migration phase (above) is independently revertible — the new
  workflow can be disabled (or its trigger removed) without affecting the
  existing manual `release:promote`/`release:patch` scripts, which keep
  working as a fallback until the cutover step.
- Do not delete or rewrite `release:patch`'s tag/commit logic until the new
  workflow has been proven on at least one real release with a human
  watching (Migration Plan step 5).
- If the merge-triggered workflow misfires (wrong commit tagged, duplicate
  tag, failed sync), the fallback is the existing manual flow — keep
  `CLAUDE.md`'s manual instructions intact (marked as fallback, not deleted)
  until the automated path has a real track record.
- **Known gap as of 2026-07-13:** the "fallback" is presently degraded, not
  fully functional — enabling the `MAIN` ruleset (Implementation Log item 1)
  means `release:patch`'s direct push to `main` now fails too, with no
  bypass actor configured. Until `RELEASE_AUTOMATION_TOKEN` is set and the
  new workflow is validated, there is genuinely no working path to cut a
  release from `main` other than a manual PR carrying just the version-bump
  commit. This is an accepted, temporary state per the user's explicit
  2026-07-13 decision to prioritize finishing the workflow over adding a
  bypass actor.

## Acceptance Criteria

- [x] Tag protection configured for `v*.*.*`
- [x] `release:promote` commits the version bump/changelog as its own
      labeled commit on the promotion branch, before PR creation
- [x] New merge-triggered workflow exists, with a `concurrency:` group keyed
      on the PR number (scoped to `contents: write` + `pull-requests: write`
      — the latter added for the failure-comment step, using the default
      token; pushes use a separate fine-grained PAT, see Implementation Log
      item 3)
- [x] Workflow tags `github.event.pull_request.merge_commit_sha`, never live
      `main` `HEAD`
- [x] Workflow syncs `develop` from `main` in one step, no second sync
      needed anywhere in the documented flow
- [x] Workflow failure produces an explicit notification, not just a
      GitHub Actions status badge
- [x] Validated on a real patch release with a human watching: PR #56
      (v1.8.218), merged 2026-07-13 23:17:47. `release-tag-on-merge.yml` ran
      to completion — tag `v1.8.218` created pointing at the exact merge
      commit `f7ec922cc`, `mobile-release-on-tag.yml` cascade-fired
      correctly via the PAT (proving the anti-recursion fix works),
      `mobile-android-release.yml` auto-triggered with no duplicate, and
      `develop` fast-forwarded to `main` — all within ~30 seconds of merge,
      zero manual steps
- [x] `CLAUDE.md`, `AGENTS.md`, and
      `apps/docs/docs/reference/release/RELEASE_WORKFLOW.md` all describe
      the same flow, with no manual step left in any of them that the
      workflow now performs automatically (commit `20623744d`, on
      `develop` — will reach `main` on the next promotion)
- [x] `AGENTS.md` step 9 stale Android-trigger instruction fixed
      (independent of the rest of this task's completion)

## Non-Goals

- Not removing the codeowner approval gate — that stays the one required
  human checkpoint.
- Not changing anything about how the Android workflow itself builds or
  publishes (Fastlane, EC2 runner, internal/alpha track logic) — this task
  only touches how the *tag* gets created and pushed, not what consumes it.
- Not re-enabling production Android track dispatch — that stays paused
  per the existing release-freeze posture, independent of this task.
- Not attempting to eliminate the merge-commit-vs-fast-forward distinction
  by changing GitHub's PR merge strategy — work with merge commits as they
  are, don't relitigate repo merge-strategy settings as part of this task.
