# Google Play Store — Testing Ladder & Production Rollout

**Status:** ✅ Done — production has been live since 2026-07-26; confirmed still shipping on the latest release, `v1.9.0` (production run succeeded 2026-08-15)
**Priority:** High
**App:** HashPass (`com.hashpass.tech`)
**Current version:** 1.9.0 (versionCode 11145)
**Updated:** 2026-08-15
**Created:** 2026-06-22

**Closing note:** This task tracked getting HashPass through the Play Console
testing ladder (internal → closed → open → production) to a first production
release. That happened on 2026-07-26 (per
`apps/docs/docs/reference/release/PLAY_CONSOLE_RELEASE_FLOW.md`'s own
now-stale-doc banner) and the app has shipped to production repeatedly since
— `gh run list --workflow mobile-android-release.yml` shows a clean
`production/production` success for every recent release tag
(`v1.8.340`, `v1.8.341`, `v1.8.342`, `v1.9.0`, ...), most recently `v1.9.0` on
2026-08-15. The release posture also matured well past what this doc
originally scoped: internal → alpha → beta now auto-chain from a single tag
push (see CLAUDE.md's "Mobile Android Release Workflow" section), with
production remaining the sole deliberate manual checkpoint by design.
All of the "Already Verified" / blocking items below are confirmed done;
the remaining Play Console *operational hygiene* items (never confirmed done
anywhere in repo docs or memory) are moved to a follow-up task — see
`.agents/pending/task-play-console-operational-hygiene.md`.

---

## Original Scope (for history)

Document and execute the full Google Play release ladder for HashPass:
internal testing, closed testing, open testing, and production rollout.

## Final State

| Area | Status | Evidence |
|------|--------|----------|
| Internal release | Done, recurring | Every tag ships `development/internal` successfully as the first rung |
| Closed testing (alpha) | Done, auto-promoted | `auto_promote_alpha=true` on every tag; confirmed success on `v1.9.0` (2026-08-15) |
| Open testing (beta) | Done, auto-promoted | `auto_promote_beta=true` on every tag; confirmed success on `v1.9.0` (2026-08-15) |
| Production release | **Done** | Live since 2026-07-26; latest confirmed production success is `v1.9.0`, run `31872883627`, 2026-08-15 |
| Play deobfuscation upload | Done | Fastlane lane uploads `mapping.txt`/`native-debug-symbols.zip` when present (since v1.8.267-era changes) |
| Privacy route | Done, still live | `curl -I -L https://hashpass.tech/privacy` returns `200` (re-verified 2026-08-15) |
| Version metadata | Done | `apps/mobile-app/package.json` / `app.json` on `1.9.0` / `11145` |
| Store listing / Data Safety / content declarations | Presumed done, not independently reverified | Cannot be independently confirmed from the repo (Play Console UI only) — but production has been publicly live and accepting real users for weeks, which is not possible without these being filled in. See follow-up task for a point-in-time re-check. |
| 14-day tester opt-in / production access gate | Done (historical) | Production access was granted before the 2026-07-26 production launch — gate no longer applies going forward |

## Still Genuinely Open (moved to follow-up task)

These were never confirmed done anywhere in repo docs, CLAUDE.md, or memory,
and aren't blocking (the app is live and shipping), so they don't belong in
an active/blocking task. Tracked in
`.agents/pending/task-play-console-operational-hygiene.md`:

- Google OAuth consent screen verification (required once user base exceeds 100 — never confirmed submitted)
- Play Console Pre-launch report (Firebase Test Lab) setup
- Reply-to-reviews process
- Full real-device validation matrix (Android 10/12/14) — only ad hoc real-device confirmation exists (v1.8.239 crash fix, PR #99/#102 swipe/drawer fixes), not a systematic sweep
- `apps/docs/docs/reference/release/PLAY_CONSOLE_RELEASE_FLOW.md` doc cleanup — the doc's own banner says its release-posture section (internal-first, alpha-only, "production paused") is stale and needs a full pass, not just the banner patch it already got

---

## Key Links
- Play Console: https://play.google.com/console
- Google Cloud OAuth consent: https://console.cloud.google.com/apis/credentials/consent
- Play Policy Center: https://play.google.com/about/developer-content-policy/
- Data Safety guidance: https://support.google.com/googleplay/android-developer/answer/10787469
