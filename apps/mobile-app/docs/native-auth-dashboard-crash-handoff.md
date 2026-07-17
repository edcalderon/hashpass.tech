# Native Auth Dashboard Crash Handoff

Status: root-caused and fixed locally; pending release verification
Last updated: 2026-07-17
Current released version: v1.8.234 (fixes below not yet released)
Current commit: `5cf17b068ab8b402d8c4a46367ba900eb4172b8a`
Package under test: `com.hashpass.tech`

## 2026-07-17 Update — Both Bugs Root-Caused And Fixed

Two independent bugs were producing the "logs in, then crashes / bounces to
landing" symptom. Both are now fixed and verified on a local release build via
a real OTP login traced with `adb logcat`.

### Bug 1 (the crash): unregistered native direct events

The native force-close was React Native throwing
`Unsupported top level event type "topDetached"` (also seen: `topScroll`)
during the auth screen -> dashboard transition. `topDetached` is the
react-native-screens header detach event; it fires when the auth screen's
stack tears down on the way to the dashboard. On Android release bundles the
JS view-config registry can be missing these direct-event declarations, and
RN's event plugin throws a **fatal** for any unregistered `top*` event.

The v1.8.233 polyfill (`lib/polyfills/native-event-registry.js`) only
pre-registered a fixed scroll/layout allowlist and did not include
`topDetached`. It also could not save `topScroll`, which crashed even though it
*was* in the allowlist — proving boot-time enumeration alone is not a complete
defense (the throwing renderer can read a registry the seeding didn't reach).

Fix (`lib/polyfills/native-event-registry.js`):
- Register the full react-native-screens + safe-area direct-event set
  (`topDetached`, `topAttached`, `topAppear`, `topDisappear`, `topWill*`,
  `topDismissed`, `topTransitionProgress`, `topHeaderHeightChange`,
  `topInsetsChange`, search-bar events, etc.), not just scroll/layout.
- Install an `ErrorUtils` global-handler guard that downgrades this entire
  error class (`Unsupported top level event type "topX"`) from a fatal to a
  logged, dropped event, and best-effort registers the missing event so later
  dispatches succeed. Dropping a lifecycle event is always better than killing
  the app.

Tests: `tests/lib/native-event-registry.test.js` (crash-guard + full event
set) and `tests/lib/android-layout-events.test.ts`. Reproduced the crash on
stock v1.8.234, confirmed the patched build survives a real OTP login.

### Bug 2 (bounces to landing): index route sends authed users to /home

After the crash was fixed, a real OTP login established the Supabase session
but the app landed on `/home` (the "Welcome back" landing), not the dashboard
— matching the resumed-session screenshots. NAVTRACE logging at every
navigation decision point showed the definitive sequence:

```text
[machine] settlingAuthenticated {isLoggedIn:true}   # on /auth, OTP verified
[rootlayout] {pathname:"/auth", isLoggedIn:true, isLoading:true}
[rootlayout] {pathname:"/",     isLoggedIn:true, isLoading:true}   # left /auth for /
[index]  Redirect -> /home                          # index sends authed user to /home
[home]   render/mount, hasUser=true                 # stranded on landing
```

Two findings:
- The auth screen's own `router.replace(dashboard)` / `<Redirect>` never
  fires: during the 350ms `settlingAuthenticated` settle it renders
  "Checking authentication…", and the app leaves `/auth` for `/` before it can
  render the dashboard redirect.
- `app/index.tsx` (the `/` route every cold start and post-login nav funnels
  through) redirected `/` -> `/home` based only on `isLoading`, never checking
  `isLoggedIn`. That is the single choke point stranding authenticated users.

There is also auth-machine flapping (`authenticated` <-> `bootstrapping`,
`isLoggedIn` momentarily false) driven by Better Auth `getSession` repeatedly
failing with `Network request failed` on native. This destabilizes the
auth-screen redirect but does not by itself cause the landing bounce.

Fix:
- `app/index.tsx`: when `isLoggedIn && user`, redirect to
  `/(shared)/dashboard/explore`; only send signed-out visitors to `/home`.
  This catches every path through `/` (cold-start resumed sessions and
  post-login flows alike).
- `app/(shared)/auth.tsx` `handleVerifyOtpCode`: call `markRecentAuthSuccess()`
  after `supabase.auth.setSession()`. The OTP path sets the Supabase session
  directly, bypassing `useAuth`'s sign-in methods (the only callers that
  previously marked the grace window), so during the Better-Auth flap the
  dashboard/root guards would otherwise bounce the just-authenticated user
  back to `/auth`. The 12s grace window holds navigation steady until the
  session settles.

Note: `/home` intentionally still shows "Welcome back" + "Go to App" for a
logged-in user who navigates there deliberately (e.g. the dashboard logo ->
landing action). The fix only changes the *default* routing through `/`.

### Follow-ups not addressed here
- The Better Auth native `getSession` `Network request failed` (and the
  resulting machine flap) is a real underlying issue worth fixing at the
  provider/bootstrap level; the grace window is a mitigation, not a cure.
- Native Google sign-in fails locally with `DEVELOPER_ERROR` (code 10) because
  the local debug keystore cert does not match the OAuth client — expected for
  local builds; verify the Google path on a real Play internal build.

---

## Original report (pre-2026-07-17-fix, retained for history)

## Current User-Visible State

The native app still crashes, but the failure moved:

- The app no longer appears to crash immediately on the auth screen.
- After the auth process, the app redirects to the landing/home screen.
- On a second attempt, the user already has a session and sees the landing "Welcome back" state.
- Pressing "Go to App" from that state attempts to enter `/(shared)/dashboard/explore`.
- The app then closes/crashes while trying to access the dashboard.

Treat this as unresolved. The last release fixed or reduced some earlier auth/logout failures, but it did not solve dashboard entry with a resumed native session.

Do not copy user emails from screenshots or logs into docs. Redact account identifiers before sharing evidence.

## Release And Pipeline State

The latest shipped patch is v1.8.234.

- Fix commit: `5fdd77c96 fix: harden native auth sign out`
- Release commit: `d5e7d6363 chore: release v1.8.234`
- Release PR: `hashpass-tech/hashpass.tech#74`, merged 2026-07-17 16:25:31 UTC
- Merge commit and tag: `5cf17b068ab8b402d8c4a46367ba900eb4172b8a`, `v1.8.234`
- Local branch state: `develop` matches `origin/develop`, `origin/main`, `upstream/develop`, and `upstream/main`
- API version guards verified on 2026-07-17:
  - `https://api.hashpass.tech/api/config/versions` returns `1.8.234`
  - `https://api-dev.hashpass.tech/api/config/versions` returns `1.8.234`

Confirmed GitHub runs in `hashpass-tech/hashpass.tech`:

- `Release tag on merge`, run `29596107355`, success
- `Deploy Infra`, run `29596107683`, success
- `Web smoke test`, run `29596107654`, success
- `HashPass Web Pipeline Monitor - main`, run `29596748820`, success
- `HashPass Web Pipeline Monitor - main`, run `29601072682`, success
- `HashPass Web Pipeline Monitor - main`, run `29604799379`, success
- `Mobile Android Release - development/internal - v1.8.234`, run `29596137413`, success
- `Mobile Android Release - development/alpha - v1.8.234`, run `29598007845`, success

The local `gh` default repo can point at `edcalderon/hashpass.tech`; pass `--repo hashpass-tech/hashpass.tech` when checking the production repo's PRs and Actions runs.

## Recent Changes Already Shipped

### v1.8.234: native sign-out hardening

Files:

- `apps/mobile-app/hooks/useAuth.ts`
- `packages/auth/src/providers/better-auth.ts`
- `apps/mobile-app/tests/auth/better-auth-provider.test.ts`
- `apps/mobile-app/tests/auth/useAuth-native-google.test.tsx`

Behavior changed:

- `useAuth.signOut()` now clears local auth state even if provider cleanup returns an error.
- Native Google account cache cleanup still runs first.
- The app signs out from `authService`, the dedicated Google Better Auth provider when present, and Supabase.
- Rejections and provider `{ error }` results are collected and logged as warnings instead of throwing.
- `sessionBootstrapPromise` is forced to `Promise.resolve(null)`.
- The XState auth session actor receives `SIGNED_OUT`, which clears all provider states locally.
- Better Auth native client calls now send trusted `Origin` and `Referer` headers based on the public web origin.

Why this was done:

- Emulator logs showed landing logout failing with `Missing or null Origin`.
- That failure left a stale Better Auth session behind.
- The stale session let the app return to auth/landing/dashboard in a broken mixed-auth state.

Validation before release:

```bash
pnpm --dir apps/mobile-app exec jest --config jest.coverage.config.cjs --coverage=false --runTestsByPath tests/auth/auth-session-machine.test.ts tests/auth/better-auth-provider.test.ts tests/auth/useAuth-native-google.test.tsx --runInBand
npm run typecheck
git diff --check
npx -y react-doctor@latest . --verbose --diff
```

Focused auth tests passed. `react-doctor` returned exit 0 with only pre-existing warnings outside the changed auth/logout files.

### v1.8.233: native dashboard routing and Android layout events

Files:

- `apps/mobile-app/app/(shared)/auth.tsx`
- `apps/mobile-app/app/home.tsx`
- `apps/mobile-app/lib/polyfills/native-event-registry.js`
- `apps/mobile-app/tests/lib/android-layout-events.test.ts`
- `apps/mobile-app/tests/lib/native-event-registry.test.js`

Behavior changed:

- Auth return paths now map public `/dashboard/explore` to the Expo Router group path `/(shared)/dashboard/explore`.
- The landing "Go to App" button navigates to `/(shared)/dashboard/explore`.
- Android native event registry gained layout event protection for the previous `topLayout` crash shape.

The old fatal `Unsupported top level event type "topLayout"` was not seen again in the later emulator logs. Do not assume that is the current crash unless new logs show it.

### Native light-mode logo contrast

Relevant file:

- `apps/mobile-app/lib/hashpass-logo.ts`

Current state:

- Native dark mode uses `logo-full-hashpass-white-cyan.png`.
- Native light mode uses `logo-full-hashpass-black.png`.
- Web light mode uses the black SVG for the normal full logo and still has a footer-specific white SVG override where the footer background is dark.
- Auth screen source selection calls `getHashpassFullLogo(isDark)` for native; only web light auth has a separate white SVG override.

This addresses the native light-mode contrast request in code. Re-check visually in the emulator if the screenshot still shows insufficient contrast, because the remaining crash is separate from logo selection.

## Current Auth Session Machine State

File:

- `apps/mobile-app/hooks/auth-session-machine.ts`

The auth state is modeled with XState.

Providers:

- `betterAuth`
- `supabase`
- `directus`

Provider priority:

1. `betterAuth`
2. `supabase`
3. `directus`

States:

- `bootstrapping`
- `settlingAuthenticated`
- `authenticated`
- `unauthenticated`

Events:

- `PROVIDER_RESOLVED`
- `SESSION_OVERRIDE`
- `CLEAR_SESSION_OVERRIDE`
- `SIGNED_OUT`

Important behavior:

- `resolveAuthenticatedUser()` first uses `sessionOverride?.user`.
- If no override exists, it picks the first logged-in provider by priority.
- `getAuthViewState()` returns `isLoggedIn` from the resolved user.
- `getAuthViewState()` returns `isLoading` while settling authenticated state or while no user exists and not all providers are ready.
- `SIGNED_OUT` clears `sessionOverride` and marks all providers ready/logged-out with `loggedOutProviderState()`.
- `settlingAuthenticated` waits `AUTH_SESSION_SETTLE_DELAY_MS = 350` before entering `authenticated`.

This machine prevents several loading/auth race conditions, but it does not validate that the resolved provider session can safely enter the dashboard. With Better Auth prioritized, the dashboard can receive a Better Auth user/session before a Supabase UUID/session exists.

## Evidence From Emulator Logs Before v1.8.234

Known prior logs:

```text
Error signing out: [Error: Missing or null Origin]
[Home] Failed to sign out: [Error: Missing or null Origin]
```

After failed logout, the app still found a session and attempted dashboard/pass work:

```text
[PassSystem] Skipping getUserPassInfo: expected a Supabase auth UUID, received non-UUID Better Auth id
[PassSystem] Skipping createDefaultPass: expected a Supabase auth UUID, received non-UUID Better Auth id
Failed to create default pass
Error fetching notifications: HTTP 401
```

Also observed as startup/navigation noise:

```text
Failed to set polyfill. URL is not configurable.
Failed to set polyfill. URLSearchParams is not configurable.
```

This URL polyfill warning has not been proven as the fatal crash. Investigate it only if fresh v1.8.234 logs include a fatal stack connected to URL/URLSearchParams polyfill setup.

## Current Working Hypothesis

The likely remaining issue is dashboard entry with a resumed Better Auth native session:

- Better Auth restores the session and supplies a user id that is not a Supabase UUID.
- The auth session machine treats that as authenticated because Better Auth has highest priority.
- Landing shows the authenticated "Welcome back" state.
- "Go to App" navigates to `/(shared)/dashboard/explore`.
- Dashboard/pass/notification code still expects Supabase-compatible identity and/or Supabase access credentials.
- The app closes during dashboard mount or early dashboard data loading.

Secondary possibilities to verify with logs:

- Remote Better Auth sign-out still does not clear the native session cookie even after adding `Origin`/`Referer`.
- The landing sign-out UI clears local state but a subsequent session bootstrap repopulates Better Auth from persisted storage.
- A URL polyfill non-configurable error becomes fatal during the second auth/dashboard transition.
- An Expo Router transition, native screen lifecycle, or React Native view event failure still happens on dashboard mount.

## Next Investigation Steps

Start from a clean v1.8.234 run. Do not trigger a duplicate Android release workflow unless retrying a known failed tag run.

Capture fresh logs:

```bash
adb -s emulator-5554 logcat -c
adb -s emulator-5554 shell monkey -p com.hashpass.tech 1
adb -s emulator-5554 logcat -v time | tee /tmp/hashpass-v1.8.234-dashboard-crash.log
```

Filter for:

```bash
rg -n "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|JavascriptException|Process com.hashpass.tech has died|am_crash|Missing or null Origin|better_auth_session|expected a Supabase auth UUID|URL is not configurable|URLSearchParams is not configurable" /tmp/hashpass-v1.8.234-dashboard-crash.log
```

Inspect these app areas first:

- `apps/mobile-app/hooks/useAuth.ts`
- `apps/mobile-app/hooks/auth-session-machine.ts`
- `packages/auth/src/providers/better-auth.ts`
- `apps/mobile-app/app/home.tsx`
- `apps/mobile-app/app/(shared)/dashboard/_layout.tsx`
- `apps/mobile-app/app/(shared)/dashboard/explore.tsx`
- `apps/mobile-app/lib/pass-system.ts`
- notification/dashboard hooks and API clients that require Supabase UUIDs or Supabase access tokens

Questions to answer in the next fix:

- After logout, does Better Auth `getSession({ force: true })` still return a session in native?
- On dashboard entry, is the active session `provider: "better-auth"` with `access_token: "better_auth_session"`?
- Which exact component/hook is the first to crash or force-close after "Go to App"?
- Should Better Auth native Google sessions be bridged to Supabase before dashboard entry, or should dashboard/pass/notifications support Better Auth identity directly?
- Should the auth machine expose provider/session type so dashboard can block unsupported sessions with a safe state instead of mounting and crashing?

## Guardrails For The Next Patch

- Treat v1.8.234 as deployed but functionally incomplete for native dashboard resume.
- Keep logs redacted.
- Do not re-debug the old `topLayout` issue unless fresh logs show it.
- Do not hand-edit version files or changelog.
- Use `--repo hashpass-tech/hashpass.tech` for GitHub release checks.
- If another release is needed, follow the `CLAUDE.md` release flow from `develop`.
