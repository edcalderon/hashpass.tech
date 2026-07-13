# Release Flow Automation — Security Hardening & Time-to-Ship KPI

**Status:** 🕒 PENDING
**Priority:** Medium
**Created:** 2026-07-13
**Depends on:** `.agents/done/task-release-flow-automation.md` (the automation this task audits and measures)

## Goal

Two things, both follow-ups to the merge-triggered release automation
shipped 2026-07-13:

1. **Security hardening** — the completed task shipped a working, validated
   system, but several considerations were explicitly deferred rather than
   solved (PAT lifecycle, no-bypass-actor policy, partial-failure runbooks).
   This task is where those get resolved.
2. **Time-to-ship as a tracked KPI** — establish the actual measured
   baseline (below, using real data from the same session that built the
   automation) and set up a way to keep measuring it going forward, not
   just as a one-time before/after snapshot.

## Time-to-Ship: Measured, Not Estimated

All timestamps below are pulled directly from GitHub's API (`gh pr view`,
`gh run list`) for the three release cycles run in the 2026-07-13 session
that built this automation — not benchmarked separately, not
hand-estimated. This is the actual sequence that happened.

**Metric:** wall-clock time from PR merge to the Android build workflow
being dispatched (the first externally-visible downstream effect of a
release, and the same checkpoint in both flows, so it's an apples-to-apples
comparator).

| Release | Flow | PR merged at (UTC) | Android build dispatched at (UTC) | Elapsed |
|---|---|---|---|---|
| v1.8.216 | Old (manual promote → worktree switch → `release:patch` → sync) | 20:45:30 | 20:47:55 | **2m 25s** |
| v1.8.217 | Old (same, executed a second time, no mistakes this run) | 22:09:58 | 22:11:17 | **1m 19s** |
| v1.8.218 | New (`release-tag-on-merge.yml`, fully automatic) | 23:17:47 | 23:18:19 | **32s** |

**Result: ~2.5x to ~4.5x faster on raw measured time, and the new flow's
32 seconds required zero manual action — the old flow's 1m19s–2m25s was
an AI agent executing every step back-to-back with no human latency at
all.**

That last point matters more than the raw numbers: the old-flow timings
above are a **best case**. They reflect an agent immediately available and
executing git/npm commands with no delay between steps. A human operator
in the same flow would need to notice the merge happened, context-switch
into a terminal, remember the exact worktree-switch step, and run each
command — realistically minutes to hours depending on availability, not
seconds. The new flow's time-to-ship is **32 seconds regardless of whether
anyone is watching**, which is the actual point of the automation: it
doesn't just make the mechanical steps faster, it removes the requirement
that a human be present and correct at all for the release to complete.

**Also worth counting, though not cleanly reducible to a single number:**
the v1.8.216 cycle above also produced a duplicate Android workflow
dispatch (a manual `gh workflow run` executed after the auto-trigger had
already fired, because the docs at the time didn't mention the auto-trigger
existed) — diagnosing it, getting cancellation authorization, cancelling
it, and documenting the fix across `CLAUDE.md` consumed real time that
doesn't show up in the table above at all, because it's investigation time,
not release-mechanics time. The new flow structurally can't produce this
specific failure mode (nothing to manually duplicate), which is a
time-to-ship win that a single-run timing table understates.

### Keeping this measured going forward

Don't let this become a one-time before/after snapshot. Options, roughly
in order of effort:

1. **Cheapest**: whenever reviewing a release, run the same `gh pr view
   <N> --json mergedAt` / `gh run list --workflow mobile-android-release.yml`
   query pair used above and note the elapsed time somewhere durable (this
   task file, a memory entry, or a running log).
2. **Better**: add a step to `release-tag-on-merge.yml` that computes
   `merge time → tag-push time` itself (it already has both timestamps
   available) and logs it as a job summary — visible in the Actions UI
   without needing to query anything after the fact.
3. **Best, if this KPI matters enough to formalize**: append each release's
   timing to a simple structured log (e.g. `metrics/release-timings.jsonl`,
   one line per release: version, merge time, tag time, elapsed seconds)
   that a future dashboard or periodic report could read. Low effort to
   add now while the workflow is already being touched; higher value the
   longer it accumulates data.

## Security Hardening Follow-Ups

None of these block the shipped automation — they're the deferred items
from the original task's risk analysis, now that there's a live system to
harden rather than a design to review.

1. **`RELEASE_AUTOMATION_TOKEN` lifecycle is currently unmanaged.**
   Fine-grained PATs carry an expiration (GitHub either requires one or
   strongly defaults to one, depending on account/org settings — confirm
   the actual expiration date set on this specific token, since it wasn't
   explicitly chosen during setup). An expired or revoked PAT means the
   *next* release silently fails at the preflight step — which is a
   correct failure mode (loud, not silent-degrade), but it fails exactly
   when someone is trying to ship, not proactively. Needs: (a) confirm the
   actual expiration date, (b) a calendar reminder or automated check
   before that date, (c) a documented rotation procedure.
2. **Consider migrating off a personal fine-grained PAT to a GitHub App
   installation token.** A PAT is tied to `edcalderon`'s personal account —
   if that account's access changes for any reason, the release pipeline
   breaks with it. A GitHub App installation is org/repo-owned, issues
   short-lived tokens automatically per run (no manual rotation), and is
   more auditable in the security log (actions are attributed to the app,
   not conflated with a human's personal PAT usage elsewhere). This is the
   "do it properly" version of the PAT stopgap that unblocked the
   2026-07-13 implementation.
3. **No bypass actor exists on the `MAIN` ruleset, at all.** This is
   probably correct as a default, but means there is currently no
   "break-glass" path for a genuine production incident that needs a
   same-minute hotfix without waiting for the normal PR/review/coverage
   cycle. Decide deliberately: either formally accept "no bypass, ever,
   even for incidents" as the policy, or design an explicit, narrowly-
   scoped emergency path (e.g., a specific person or a documented
   admin-override procedure) rather than leaving it undecided.
4. **`npm run release:patch`'s direct-push-to-`main` fallback is currently
   just broken, not a real fallback.** It will fail against the active
   `MAIN` ruleset with no bypass configured. Either formally retire it from
   the docs (currently it's still documented as an "emergency path," which
   is misleading if it doesn't actually work) or make a decision about #3
   above that would let it function again when genuinely needed.
5. **`require_code_owner_review` is still `false`** on the `MAIN` ruleset
   despite `CODEOWNERS` existing — any approving reviewer satisfies the
   rule today, not specifically the codeowner. Left as explicit user
   decision 2026-07-13 ("leave it as-is for now"); revisit whether that's
   still the right call once there's more than one plausible reviewer on
   this repo.
6. **Partial-failure runbook doesn't exist yet.** `release-tag-on-merge.yml`
   comments on the PR if it fails, but there's no written procedure for
   what a human should actually *do* next in each failure mode (tag created
   but develop-sync failed; tag-creation itself failed; preflight failed
   because the PAT expired). Write one, even briefly — the failure comment
   tells you something broke, not how to fix it.
7. **No success-path visibility beyond the Actions tab.** Failure produces
   a PR comment; success produces nothing visible outside of checking
   Actions manually. Consider whether a lightweight success notification
   (Slack/Discord webhook, or just a PR comment on success too) is worth
   adding, especially once more people rely on this flow and can't be
   expected to check Actions after every merge.
8. **Verify the PAT's actual granted scope matches what was requested.**
   It was created via GitHub's web UI (fine-grained, this repo only,
   Contents read/write) per the setup instructions, but that was never
   independently verified against the token's real permissions after the
   fact — worth a one-time check in GitHub Settings to confirm no broader
   scope got granted by mistake.
9. **Tag creation itself isn't restricted to specific actors.** The
   `release-tags` ruleset (id `18897278`) blocks deletion/update of
   existing `v*.*.*` tags but doesn't restrict who/what can *create* one.
   Now that a tag carries real deploy authority (triggers the Android
   build), consider whether that's a gap worth closing — e.g., could
   someone with plain push access create a `v9.9.9` tag by hand and trigger
   an unintended Android build outside the release flow entirely?

## Future Improvement Ideas

Lower priority, not required for the security/KPI goals above, but worth
tracking so they're not lost:

- Extend the same "structurally automatic, not manually remembered" pattern
  to the `upstream` fork sync, which is still a fully manual step today
  (`git push upstream develop <TAG>`). Could be a scheduled job (e.g.
  nightly) rather than reactive, since it's a backup mirror, not a
  release-critical path.
- Once the timing log from the KPI section exists, consider a small
  dashboard or periodic summary (even just a monthly note) rather than
  requiring someone to go dig through `gh api` history to answer "is
  releasing getting faster or slower over time."
- Evaluate whether `release:promote` itself could ever be triggered by
  something other than a manual `npm run release:promote` call — weigh
  this against the value of its current "only promote when there's a
  deliberate decision to release" gate, which is arguably a feature, not a
  gap to automate away.
- Once the GitHub App migration (#2 above) happens, revisit whether the
  same app identity could also handle the `upstream` sync, removing the
  "no token can reach a different account's fork" limitation noted in
  `release-tag-on-merge.yml`'s current design.

## Acceptance Criteria

- [ ] `RELEASE_AUTOMATION_TOKEN` expiration date confirmed and a rotation
      reminder/process exists
- [ ] Decision made (and documented) on GitHub App migration for the PAT —
      do it, or explicitly defer with a reason
- [ ] Decision made (and documented) on emergency bypass policy for `main`
      — formal "never" or a designed break-glass path
- [ ] `release:patch`'s fallback status in the docs matches its actual
      working/non-working state
- [ ] Partial-failure runbook written for `release-tag-on-merge.yml`
- [ ] Time-to-ship measurement method chosen from the three options above
      and actually implemented, not just documented as an idea
- [ ] Tag-creation restriction question (#9) explicitly decided, not left
      ambiguous
