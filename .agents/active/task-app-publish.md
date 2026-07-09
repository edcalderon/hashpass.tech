# Google Play Store — Testing Ladder & Production Rollout

**Status:** 🟡 Android release v1.8.148 succeeded on internal; the matching alpha closed-testing publish is still pending and production remains paused  
**Priority:** High  
**App:** HashPass (`com.hashpass.tech`)  
**Current version:** 1.8.148 (versionCode 10948)  
**Release tag:** `v1.8.148`  
**Updated:** 2026-07-03  
**Created:** 2026-06-22

---

## Overview
Document and execute the full Google Play release ladder for HashPass: internal testing, closed testing, open testing, and production rollout. The repo now supports the Play Console flow end-to-end, and the Android release workflow enforces internal-before-alpha so closed testing stays in version-code order.

## Current State

| Area | Status | Evidence |
|------|--------|----------|
| Android release workflow | Internal succeeded | GitHub Actions run `28680249547` completed successfully for the `v1.8.148` internal release |
| Closed testing release | Pending | No `v1.8.148` alpha run has been dispatched yet; the matching closed-track publish is the next required step |
| Play deobfuscation upload | Needs verification | The workflow is wired to upload `mapping.txt` or `native-debug-symbols.zip` when present; verify on the next alpha publish |
| Play Console release guide | Done | `apps/docs/docs/reference/release/PLAY_CONSOLE_RELEASE_FLOW.md` now documents internal, closed, open, and production release paths |
| Production release | Paused | Production dispatches remain on hold for the current release freeze |
| Version metadata | Done | `package.json`, `apps/mobile-app/package.json`, and `apps/mobile-app/app.json` are on `1.8.148` / `10948` |
| Store assets | Done in repo | `apps/mobile-app/assets/store/google-play/` contains the feature graphic and screenshots |
| Privacy route | Done in repo | `apps/mobile-app/app/(shared)/privacy.tsx` and `apps/mobile-app/public/sitemap.xml` export the policy page |
| Web route export fix | Deployed | `apps/mobile-app/scripts/patch-web-seo.mjs` now mirrors server route HTML into `dist/client` folder indexes |
| Live privacy URL | Done | `curl -I -L https://hashpass.tech/privacy` now returns `200` |
| Amplify web deploy | Done | Latest successful job is `322` on commit `0fc977db9` |

## Checklist Audit

### Already Verified
- [x] Internal release `v1.8.148` succeeded on GitHub Actions run `28680249547`
- [x] Version metadata is synced to `1.8.148` / `10948`
- [x] Store assets exist in repo under `apps/mobile-app/assets/store/google-play/`
- [x] Privacy route is live and `https://hashpass.tech/privacy` returns `200`
- [x] Web route export fix is in place for the current web deploy path
- [x] Latest successful web deploy is job `322` on commit `0fc977db9`

### Still Open
- [ ] Alpha closed-testing publish for `v1.8.148`
- [ ] 14-day tester opt-in / production access gate
- [ ] Production track publish
- [ ] Play Console store listing, Data Safety, content rating, and sign-in declarations
- [ ] Device validation on real hardware

## What Is Still Missing

- Publish `v1.8.148` to the Play Console `alpha` closed-testing track on the same tag as the successful internal release.
- Use `release_status=draft` only if Play still treats the app as a draft; otherwise publish the alpha release with `release_status=completed`.
- Keep the closed-test tester list opted in long enough to satisfy the 14-day production-access requirement.
- Verify the next alpha upload includes deobfuscation artifacts if the Android build produces them.
- Leave production paused until the release freeze is explicitly lifted.

## Version Rationale

`1.8.148` is the current repo version after the latest patch release. The workflow guard keeps internal and alpha ordered on future tags, the latest internal build succeeded on the same tag, and the next missing publish step is the matching alpha closed-testing release.

## Roadmap

1. Keep the privacy/terms icon imports on the local wrapper path so Metro and the native bundle resolve the same code.
2. Use the `v1.8.148` internal success as the baseline for the matching alpha/closed release.
3. Keep the new internal-before-alpha guard in place for future tags so closed testing cannot get ahead of internal.
4. Dispatch alpha on the same tag after the internal release succeeds.
5. Confirm the closed-test tester list stays opted in for the full 14-day requirement.
6. Keep production paused until the release freeze is lifted.
7. Publish the next production-ready tag to the production track with `release_status=completed`.
8. Monitor the rollout, Android Vitals, and review feedback immediately after launch.
9. Keep `develop` synced with `main` after the production release is finalized.

---

## Pre-Submission Checklist

### 1. Store Listing (Play Console → Store presence → Main store listing)
- [ ] **App name:** "HashPass" (30 chars max)
- [ ] **Short description:** ≤80 chars — e.g. "Digital event passes, wallet & networking for live events"
- [ ] **Full description:** ≤4000 chars — include key features, no keyword stuffing, no competitor mentions
- [ ] **App icon:** 512×512 PNG, no alpha/transparency on the icon layer
- [ ] **Feature graphic:** 1024×500 PNG/JPG (required for production)
- [ ] **Screenshots:** Minimum 2 phone screenshots (1080×1920 or 1080×2400 recommended)
  - Dashboard / explore screen
  - Wallet screen
  - Profile screen
  - QR scanner in use
- [ ] **Category:** `Business` or `Events` (avoid "Social" to reduce scrutiny)

### 2. Privacy Policy & Data Safety
- [x] **Privacy policy URL** must be live and accessible (not localhost)
  - Repo route exists at `apps/mobile-app/app/(shared)/privacy.tsx`
  - Current check: `https://hashpass.tech/privacy` returned `200` on 2026-07-03
- [ ] **Data Safety form** (Play Console → Policy → App content → Data safety):
  - Data collected: Email address (required, account management)
  - Data collected: Name (optional, account management)
  - Data collected: Photos/profile picture (optional, account management)
  - Data shared: None (unless you send data to third parties)
  - Security practices: Data encrypted in transit ✅, you can delete account ✅
  - Google Play does NOT audit this automatically — fill it accurately to avoid later removal

### 3. App Content Declarations (Play Console → Policy → App content)
- [ ] **Target audience:** 18+ (select "Adults" — avoids child-directed policy)
- [ ] **Sensitive permissions:**
  - Camera: used for QR code scanning — state exact use case
  - Storage (if applicable): only if saving files locally
- [ ] **Ads declaration:** "No ads" (confirm this is true)
- [ ] **COVID-19 contact tracing:** N/A

### 4. Google Sign-In Requirements (Critical — common rejection reason)
Google's review team will test sign-in. Requirements:
- [ ] Google Sign-In button must use **official branding**: "Sign in with Google" or "Continue with Google" (not custom text like "Google Login")
- [ ] Must not request scopes beyond what the app needs — only `email` and `profile`
- [ ] OAuth consent screen in Google Cloud Console must be:
  - App name matching Play Store listing
  - Support email set
  - App logo uploaded
  - Privacy policy URL filled
  - **Verification status:** For apps with >100 users, the OAuth consent screen may need Google verification — submit this early as it takes 1-4 weeks
- [ ] If using unverified OAuth scopes, add test users in Google Cloud Console for the review team

### 5. Permissions Justification
For each dangerous permission, Play requires a justification. Prepare short rationale:
- `CAMERA`: "Used exclusively to scan QR codes for event check-in and pass verification"
- `READ_EXTERNAL_STORAGE` (if used): "Used to select profile photos from device gallery"
- `POST_NOTIFICATIONS`: "Used to deliver real-time event updates and meeting request alerts"
- `INTERNET`: Standard — no justification needed

### 6. Release Notes (What's new)
- Use the release notes for the version you are actually shipping.
- `v1.8.148` is the current release baseline, so keep the Play Console notes short and accurate unless the app code changes again.

### 7. Testing on Real Devices Before Submission
- [ ] Install from Play closed testing alpha track or internal track on the fresh tag (not dev build)
- [ ] Complete full sign-in flow with Google account
- [ ] Navigate to all tabs: Explore, Wallet, Notifications, Profile, Settings
- [ ] Test QR scanner
- [ ] Test sign-out and sign-in again
- [ ] Test on Android 10, 12, 14 (cover range)
- [ ] Verify no crashes in Android Vitals for 24h after the closed test upload

### 8. Build Configuration
- [x] `app.json` → `expo.android.versionCode` is `10948`
- [x] `app.json` → `expo.version` matches `1.8.148`
- [ ] Signing with production keystore (`hashpass-release.keystore`) — NOT debug key
- [ ] `minSdkVersion` ≥ 23 (Android 6.0) — verify in the generated Android project
- [ ] `targetSdkVersion` = 34 (required for new submissions in 2025) — verify in the generated Android project / AAB

---

## Release Flow

### 1. Internal Testing
- Use `environment=development` for the fastest QA loop on the Play internal track.
- Keep this track for trusted testers and smoke tests before broader release.
- Verify sign-in, navigation, QR scanning, and the privacy/terms back buttons before moving on.

### 2. Closed Testing
- The Play Console alpha track for `v1.8.148` now has an internal baseline; once the matching closed-test draft is published, roll it out from `Manage track`.
- Keep the tester list opted in for at least 14 continuous days if you are applying for production access on a personal developer account.
- Confirm testers can install the build, sign in, and complete the critical flows.
- If Play still treats the app as draft after the upload, continue using `release_status=draft` for the first upload and `completed` once Play accepts the app.

### 3. Open Testing
- Use the beta/open track only after production access is available.
- Use this when you want a broader audience to join the test and provide feedback.
- Validate the same critical flows, plus device diversity and stability.

### 4. Production Access and Publish
- Apply for production access after the closed-test requirements are met.
- Be ready to answer Play Console questions about the test group, testing process, and production readiness.
- Once approved, publish to the production track with `release_status=completed`.
- Use a staged rollout if you want to reduce release risk, then expand to 100% once the rollout is healthy.
- Watch Android Vitals, crash logs, and review feedback immediately after rollout.

### 5. Production Checklist for the Current Baseline
- First roll out the active closed-testing draft on the existing alpha track after internal has succeeded for the same tag.
- Confirm the closed-test baseline is healthy before cutting the next patch release.
- Do not reuse `v1.8.148` for production; use the next release tag generated from `npm run release:patch`.
- Trigger the Android workflow with `environment=production`, `track=production`, and `release_status=completed`.
- Verify the production rollout, the web deploy checks, and the post-launch Android Vitals before marking the task complete.

---

## Post-Approval Tasks
- [ ] Set up **Google Play App Signing** if not already active
- [ ] Configure **Pre-launch report** (Firebase Test Lab) for automated device testing
- [ ] Monitor **Android Vitals**: crash rate, ANR rate (target < 1% for both)
- [ ] Set up **Reply to reviews** process
- [ ] Submit OAuth consent screen for Google verification if user base exceeds 100

---

## Key Links
- Play Console: https://play.google.com/console
- Google Cloud OAuth consent: https://console.cloud.google.com/apis/credentials/consent
- Play Policy Center: https://play.google.com/about/developer-content-policy/
- Data Safety guidance: https://support.google.com/googleplay/android-developer/answer/10787469
