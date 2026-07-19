# Native Auth Dashboard Crash Handoff

Status: **RESOLVED in v1.8.239** — confirmed on a real internal-track Play install (device screenshot, not emulator): app reaches `/(shared)/dashboard/explore`, renders the drawer/sidebar, and stays alive. See "2026-07-19 Update #5" below. The historical investigation (Updates #1-#4 and everything below them) is retained for context; do not re-open it unless a fresh crash with a `FATAL EXCEPTION` / `Unsupported top level event type` signature reappears in logs.
Last updated: 2026-07-19
Current released version: v1.8.239 (contains all fixes below, including the renderer patch and Better Auth SecureStore caching)
Package under test: `com.hashpass.tech`

## 2026-07-19 Update #5 — v1.8.239 Confirmed Fixed On Real Device

Released `938d55b62 fix: stabilize Play Android native login` (PR merge
`4214181e8`, tagged and shipped as `chore: release v1.8.239` / `d8afe57b9`).

Verification evidence: a screenshot from a real device running the shipped
build shows the dashboard's sidebar/drawer open (Explore, Wallet,
Notifications, Profile, Settings, Actions) over the dashboard content, with
no crash and no bounce back to auth/landing. This is the first confirmation
of this fix on a real Play-distributed install rather than only the local
emulator/Play-parity smoke tests recorded in Update #4.

This closes out the crash chain described in Updates #1-#4:
`topLayout`/`topAttached`-class unsupported Fabric events (fixed via the
`react-native@0.79.6` renderer patch), the ErrorUtils install-order bug
(fixed via re-installing the guard after `expo-router/entry` resolves), and
the Better Auth native session flap on cold reopen (fixed via SecureStore
session caching + root-route redirect hysteresis in `app/_layout.tsx`).

**New, separate issue surfaced by the same screenshot**: the open sidebar is
mispositioned on some devices, does not close on outside-tap, and its
Logout action does not work. This is a distinct dashboard-drawer bug, not a
recurrence of the auth crash — tracked and fixed separately (see
`dashboard-sidebar-drawer-bugs.md` / commit history from 2026-07-19 onward).
Do not conflate the two: the auth/crash chain above is closed.

## 2026-07-19 Update #4 — Play-Parity Login And Cold Reopen Verified

After adding a Google Cloud Android OAuth client for the Play **Upload key**
SHA-1, the local Play-parity split install could complete native Google Sign-In
instead of stopping at Google's `OAuth2.0` registration error.

Local artifact under test:

- Built with `npm run android:play-parity:dev`.
- Installed through bundletool split APK delivery from
  `apps/mobile-app/android/app/build/outputs/bundle/release/app-release.aab`.
- Installed package metadata: `versionName=1.8.238`,
  `versionCode=29740455`, `minSdk=24`, `targetSdk=35`.

Verification result:

- Native Google Sign-In reached the account picker and returned to the app.
- The app reached `/(shared)/dashboard/explore` and stayed alive.
- `adb logcat` showed no `Unsupported top level event`, no `FATAL EXCEPTION`,
  and no `Process com.hashpass.tech has died`.
- The emulator still showed Better Auth native network failures:

```text
[useAuth] Better Auth native Google ID-token exchange failed, trying Supabase fallback: Network request failed
Better Auth getSession error: TypeError: Network request failed
```

That exposed one final cold-start bug: Better Auth's mapped session was
memory-only on native. If a process restart hit `getSession()` network failure
before a provider could restore a session, the root guard could still treat the
dashboard as signed out. The local fix now adds two defenses:

- `packages/auth/src/providers/better-auth.ts`: native Better Auth sessions are
  cached in SecureStore after a successful server session read. A later
  transport failure uses that cache as stale-while-error state. A definitive
  server signed-out response or explicit sign-out clears the cache.
- `app/_layout.tsx`: the root protected-route guard now has the same 2.5s
  signed-out hysteresis as the dashboard layout and re-checks current auth state
  before redirecting.

Final emulator check:

- Force-stopped `com.hashpass.tech` while on the dashboard.
- Relaunched from the launcher.
- The app stayed on the dashboard with a live process.
- Filtered logcat still showed Better Auth `Network request failed`, but showed
  no `redirecting to auth`, no unsupported event error, and no fatal exception.

Regression coverage:

- `tests/auth/better-auth-provider.test.ts` covers native SecureStore caching,
  cold-start transport failure fallback, and cache clearing on definitive
  signed-out response.
- Full mobile Jest: 71 suites / 313 tests passed.
- `npm run typecheck` passed.

## 2026-07-19 Update #3 — v1.8.238 Proved ErrorUtils Is Too Late

Important correction: v1.8.238 did merge and ship to Play internal + alpha.
It contains the ErrorUtils re-install fix from Update #2 below, but a fresh
emulator run of the installed app (`versionName=1.8.238`) still force-closed
during native Google Sign-In.

Fresh ground truth from `adb logcat`:

```text
E ReactNativeJS: Error: Unsupported top level event type "topLayout" dispatched
W BridgelessReact: ReactHost{0}.handleHostException(message = "...topLayout"...)
E AndroidRuntime: FATAL EXCEPTION: mqt_v_native
E AndroidRuntime: com.facebook.react.common.JavascriptException: Error:
  Unsupported top level event type "topLayout" dispatched
  at com.facebook.react.modules.core.ExceptionsManagerModule.reportException(SourceFile:77)
I ActivityManager: Process com.hashpass.tech (pid 23748) has died: fg TOP
```

The log also showed our boot-time registry patch did run and did seed
`topLayout`:

```text
[HashPass][events] installed native direct event fallbacks
  patched: [ "topLayout", ..., "topInsetsChange" ],
  crashGuardInstalled: true
```

Two conclusions are now proven:

1. Boot-time seeding can patch one registry object while the renderer's
   `extractEvents` path still sees a missing event config.
2. The fatal in Bridgeless/Fabric can bypass the active `ErrorUtils` handler
   and go straight through `ReactHost.handleHostException` to
   `ExceptionsManagerModule.reportException`. Re-installing ErrorUtils in
   `app/_layout.tsx` is not sufficient.

### The v1.8.239 fix

Patch React Native 0.79.6 itself via `pnpm.patchedDependencies`
(`patches/react-native@0.79.6.patch`). The patch changes every relevant RN
renderer implementation (`ReactFabric` and `ReactNativeRenderer`,
dev/prod/profiling) at the actual throw site:

- If `extractEvents()` sees a missing event config for a `top*` event, it
  synthesizes a direct event config (`{ registrationName: "on" + name.slice(3) }`)
  and continues dispatching.
- Non-`top*` unsupported events still throw exactly as before.

This moves the defense from "try to catch the fatal after the renderer throws"
to "do not let the renderer throw for this known recoverable event class."

Regression test: `tests/lib/native-event-registry.test.js` now also asserts
the committed React Native patch covers all six renderer files. This is the
durable test for this failure because the crashing code lives inside RN's
bundled renderer, not inside app code.

Local APK smoke for the renderer patch:

- Built `apps/mobile-app/android/app/build/outputs/apk/release/app-release.apk`
  successfully with Java 17 and `ANDROID_HOME=/home/ed/Android/Sdk`.
- Android rejected in-place replacement of the Play-installed v1.8.238 because
  the local APK signature differs, so the emulator copy was uninstalled first.
- The patched APK installed and launched cleanly. Startup logcat showed
  `[HashPass][events] installed native direct event fallbacks` with
  `topLayout` included, and `pidof com.hashpass.tech` stayed alive.
- A login tap on the clean local build handed off to Google Play / Play
  services rather than reaching the dashboard transition. That run did not
  reproduce the original crash path, but it also produced no
  `Unsupported top level event type`, no `FATAL EXCEPTION`, and no new
  `dumpsys activity exit-info` `APP CRASH` record for `com.hashpass.tech`.

Release-parity correction: this APK smoke is **not** the same artifact shape
as the published Play build. The Play workflow builds an Android App Bundle
(`bundleRelease`) with a CI-written minimal mobile `.env`, release upload
signing, and Play split delivery. A local `assembleRelease` APK can hide bugs
that depend on any of those differences. For future "works locally, crashes
from Play" reports, use:

```bash
npm run android:play-parity:dev
npm run android:play-parity:dev -- --install
```

The helper refuses to run without auth-critical public env values and release
signing credentials, so a local pass/fail is much closer to the internal/alpha
Play artifact before a new release is shipped. Local no-submit builds invoke
Gradle directly because Fastlane's build lane only wraps `bundleRelease`;
explicit Play upload mode still goes through Fastlane. The helper also sets
`EXPO_NO_DOTENV=1` so local `.env*` files cannot mask a CI/Play env problem.

2026-07-19 local parity result: the AAB built successfully and installed as
split APKs on the emulator. Startup and auth-screen navigation produced no
`Unsupported top level event type` and no `FATAL EXCEPTION`. Native Google
Sign-In reached the Google account picker, then Google rejected the local
build before returning an ID token:

```text
This android application is not registered to use OAuth2.0
```

That is an OAuth client configuration gap for local parity, not the renderer
crash. Play-delivered apps are signed with Google's App signing key, but the
local split install is signed with the Upload key. To complete local Google
login through this parity loop, Google Cloud needs an Android OAuth client for
`com.hashpass.tech` with the Upload key SHA-1.

---

## 2026-07-18 Update #2 — The Crash Guard Has Been Dead Code Since It Shipped

This is ground truth, not inference: a locally-built v1.8.237 (with the
provider-flap fixes below already applied) still force-closed on the
**emulator**, driven live through a real Google Sign-In. `adb logcat -d`
captured the complete FATAL EXCEPTION Java stack — the first real native
crash stack this investigation has had all session (Sentry has never once
captured this crash class from a real device).

```
E ReactNativeJS: Error: Unsupported top level event type "topLayout" dispatched
W BridgelessReact: ReactHost{0}.handleHostException(message = "...topLayout"...)
  extractEvents → anonymous → batchedUpdatesImpl → batchedUpdates$1 → dispatchEvent
E AndroidRuntime: FATAL EXCEPTION: mqt_v_native
E AndroidRuntime: com.facebook.react.common.JavascriptException: Error: Unsupported
  top level event type "topLayout" dispatched
  at com.facebook.react.modules.core.ExceptionsManagerModule.reportException(SourceFile:77)
I ActivityManager: Process com.hashpass.tech (pid 19113) has died: fg TOP
```

### The bug: our ErrorUtils crash guard has never actually run

`lib/polyfills/native-event-registry.js`'s `installUnsupportedEventCrashGuard`
(shipped v1.8.233, expanded v1.8.235) is supposed to downgrade exactly this
error class from fatal to a dropped/logged event. Its own success log —
`[HashPass][events] dropped unsupported native event instead of crashing` —
has **never appeared in any log this entire session**, across every crash,
even though its install log (`installed native direct event fallbacks`)
fires on every single launch. The guard installs. Then something silently
throws it away before the first Fabric event ever reaches it.

Root cause, confirmed by reading the actual RN source
(`node_modules/react-native/Libraries/Core/setUpErrorHandling.js`):

```js
// unconditional, no capture of the previous handler, no chaining
const ErrorUtils = require('../vendor/core/ErrorUtils').default;
ErrorUtils.setGlobalHandler(handleError);
```

`index.js` installs our guard onto `global.ErrorUtils` at the top of the
file, **before** calling `require('expo-router/entry')`. That require pulls
in React Native's own core init as a transitive dependency, which runs the
snippet above — silently replacing our guard with RN's default handler, no
chaining, no trace. Everything installed afterward (Sentry's handler,
`installGlobalErrorHandler()` in `app/_layout.tsx`) captures "the current
handler" at that point and wraps it — but by then "the current handler" is
already RN's own default, not our guard. Our guard becomes fully orphaned:
still a live closure in memory, never called again by anything.

This is not a new bug introduced this session — it has been the actual
reason every "Unsupported top level event type" fix since v1.8.221 kept
resurfacing under a different event name (`topLayout` → `topScroll` →
`topDetached` → now `topLayout`/`topAttached` again). Each release's fix
correctly expanded the registered-event allowlist and made the guard's
*logic* correct; none of them fixed *installation order*, so the guard
itself was never in the active handler chain to begin with. The "local
release build survived a real OTP login" verification claimed for v1.8.235
was real but incomplete — it happened not to hit this specific transition
in that run; the guard's ineffectiveness was never actually exercised by
that test.

### The fix

`app/_layout.tsx`, immediately after `installGlobalErrorHandler()`:
re-install `installNativeEventRegistryPatch()` a second time. By this point
in module evaluation, `require('expo-router/entry')` has already fully
resolved (including RN core's own `setUpErrorHandling.js`) and Sentry has
already called its own `ErrorUtils.setGlobalHandler`. Re-installing here
makes our guard the **last-installed**, and therefore active/outermost,
handler for the remainder of the app's life — nothing else calls
`ErrorUtils.setGlobalHandler` after this point in the module graph.
`index.js`'s original call still matters and stays: it seeds
`directEventTypes` as early as possible, before any Fabric view can mount.
Only the guard half of that call was silently losing the ordering race.

Regression test: `tests/lib/native-event-registry.test.js` — "regains
control when re-installed after something else overwrote the handler"
— installs the guard, simulates RN core's unconditional overwrite (proving
the orphaned guard lets a fatal reach the default handler), then re-installs
and proves the guard is active again. Fails against the old single-install
code path; passes with the fix.

### Why this was never caught by local testing before today

Local `assembleRelease` testing this session used OTP login exclusively.
Native Google Sign-In on a local debug-keystore build normally fails outright
(`DEVELOPER_ERROR`) before ever reaching the app — see the 2026-07-17
entry below. It happened to succeed this time (system Google account already
configured on this emulator image), which is the only reason this path was
exercised at all. **Do not treat "OTP path survives" as proof this class of
crash is fixed** — the guard's install-order bug affects any Fabric
transition, not something specific to Google Sign-In; that was just the
first transition, this session, timed unluckily enough to hit an
unregistered event.

---

## 2026-07-18 Update #1 — The Provider-Flap Chain: Provider Flap → Guard Redirect → Fabric Death

v1.8.235 (event-registry + routing) and v1.8.236 (null pass-data hardening)
both shipped and both still crashed on the physical device with a *new,
decisive* observable: **the dashboard mounts, then visibly redirects, then the
app closes**. That redirect pinpointed the chain. Everything below was
established this session with live evidence, not code reading alone.

### What was ruled out first (evidence log)

- **Local reproduction is impossible for this bug — understand why before
  trusting any emulator result.** A local `assembleRelease` of v1.8.235
  (dev profile, real OTP login with the reporter's own account, pass card
  rendering, EN + ES locales, force-stop relaunch with restored session)
  survived every path. The reason it cannot reproduce: locally, native Google
  sign-in always fails (`DEVELOPER_ERROR`, debug keystore), so a Better Auth
  session never exists on the emulator — and the crash requires one.
- **The stray-JSX-text theory was disproven live.** `</View> {/* comment */}`
  in PassCard does compile to a `" "` string child (verified via Babel), but
  the pass card renders fine on-device in this RN version. Fixed anyway in
  v1.8.236 alongside real null-safety gaps in `getUserPassInfo()`.
- **Sentry is blind to this crash class.** Zero events have EVER arrived from
  a physical device (all recorded events trace to emulator sessions). The
  Sentry Expo config plugin was removed (v1.8.201), so there is no NDK layer:
  a native/C++ Fabric death produces nothing. Do not treat "no Sentry event"
  as "no crash". The only ground-truth sources for this device are Play
  Console Android Vitals or the phone itself over USB.
- **Play delivery was verified, not assumed**: v1.8.235 and v1.8.236 internal
  + alpha workflow runs all succeeded; the device genuinely ran the fixed
  builds.
- **Android 6.0.1 question answered**: every release ever shipped used Expo
  SDK 53 → `minSdkVersion 24` (Android 7.0). A 6.0.1 device can never have
  installed this app; the crashing phone is not a 6.0.1 device.

### The five-link chain (each link has a file:line)

1. **Bootstrap short-circuit falsely zeroes Supabase.** When Better Auth
   restores a session at cold start, `useAuth` marked `supabase` (and
   `directus`) logged-out *without checking them* and skipped
   `startLegacyBootstrap()` entirely (`hooks/useAuth.ts` ~550). An OTP user
   with a real persisted Supabase session loses it from the machine's view.
2. **Better Auth native `getSession` is chronically flaky** (`TypeError:
   Network request failed` — seen constantly in emulator logcat too).
3. **The provider treated a transport failure as a logout.**
   `packages/auth/src/providers/better-auth.ts` `getSession` catch: set
   `currentSession = null` + `notifyStateChange(null)`. One network blip
   broadcast "logged out" to every subscriber → with link 1, zero providers
   remain → `isLoggedIn` flips false while the dashboard is up.
4. **The dashboard guard ejected instantly.**
   `app/(shared)/dashboard/_layout.tsx` ~751: `!authLoading && !isLoggedIn` →
   `router.replace('/(shared)/auth')`, protected only by a 12-second
   post-login grace window that is **memory-only on native** (sessionStorage
   does not exist there) — so a reopened app has zero protection. That is the
   visible "suddenly redirect".
5. **The forced dashboard unmount mid-mount is the Fabric crash window.**
   Sentry (emulator, v1.8.229) captured exactly this shape:
   `IllegalStateException: The specified child already has a parent` in
   `FabricUIManager` during a Choreographer frame. On the device it dies
   native-side (invisible to Sentry per above) → "app closes". Reopen
   restores the Better Auth session → dashboard flashes → refresh fails →
   repeat: the crash loop.

### The fixes (v1.8.237)

- **Provider stale-while-error** (`better-auth.ts` getSession catch): a
  transport failure now returns the last-known session and does NOT broadcast
  a logout. Only a successful response with no user (the server definitively
  saying "signed out") clears state. Test: `better-auth-provider.test.ts`
  ("keeps the last-known session…", "still clears the session…").
- **Bootstrap resolves Supabase for real** (`useAuth.ts`): when Better Auth
  has a session, Supabase is now resolved from its locally persisted session
  (a storage read, no network) instead of being force-marked out — a second
  provider keeps backing `isLoggedIn` through any Better Auth flap. Test:
  `useAuth-native-google.test.tsx` ("keeps the user logged in via Supabase
  when a restored Better Auth session later flaps to null") — this test
  replays the exact reported sequence and fails on the old code.
- **Guard hysteresis** (`dashboard/_layout.tsx`): the auth redirect now fires
  only if the signed-out state persists for 2.5s (re-checked via refs when
  the timer fires). A momentary flap can no longer force-unmount the
  dashboard — which both fixes the UX and stops entering the Fabric crash
  window.

### Still open / next if it recurs

- The underlying Better Auth native network failures (Origin/cookie handling)
  deserve their own fix; the app now *survives* them rather than needing them
  gone.
- If any post-v1.8.237 crash appears: get the stack from Play Console →
  Android Vitals (filter the new versionCode), or the phone over USB
  (`adb logcat`, `dumpsys activity exit-info com.hashpass.tech`). Do not
  rely on Sentry for native deaths until an NDK layer is added.

---

## Previous status (2026-07-17, retained)

Status: root-caused and fixed locally; pending release verification
Current released version at the time: v1.8.234
Current commit: `5cf17b068ab8b402d8c4a46367ba900eb4172b8a`

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
