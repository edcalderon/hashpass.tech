# Dashboard Sidebar/Drawer Bugs (post-v1.8.239)

Status: two fixes shipped (logout, RTL mirroring); outside-tap-to-close needs
live-device confirmation before considering it closed.
Reported: 2026-07-19, immediately after confirming the v1.8.239 native login
crash fix (see `native-auth-dashboard-crash-handoff.md`) on a real device —
the same verification screenshot that showed the dashboard drawer open also
showed these three symptoms:

1. The sidebar/drawer opens in a visually wrong position on some devices.
2. The sidebar doesn't close when tapping outside it (the dimmed backdrop).
3. The Logout button does nothing.

All three were investigated via code reading and library source inspection
(`@react-navigation/drawer` v7 / `react-native-drawer-layout`), not live
device reproduction — no build/login was done this session. Treat the two
fixes below as well-reasoned and unit-tested where testable, but confirm on
a real device before fully closing this out, consistent with this app's own
established practice for silent Android UI bugs (see
`drawer-navigation-gotchas.md` and `mobile-native-crash-debugging` — static
reading alone has missed the real cause for this exact class of bug before).

## Bug 1 (fixed, unit-tested): Logout does nothing

**Root cause**: `apps/mobile-app/lib/auth/recent-auth.ts` exports
`markRecentAuthSuccess()`/`hasRecentAuthSuccess()`/`clearRecentAuthSuccess()`
— a 12-second (`AUTH_REDIRECT_GRACE_MS`) "just logged in" grace window used
by two separate auth guards (`app/_layout.tsx` and
`app/(shared)/dashboard/_layout.tsx`) to avoid kicking a just-authenticated
user back to `/auth` during a momentary Better Auth `getSession()` network
flap (the same native flakiness documented throughout the v1.8.234-239 crash
investigation). When `isLoggedIn` is false AND `hasRecentAuthSuccess()` is
true, both guards skip redirecting and instead call
`authService.getSession()` again ("maybe it'll come back").

`clearRecentAuthSuccess()` was exported but **never called anywhere in the
app** (confirmed via `grep -rn "clearRecentAuthSuccess"` — zero call sites
before this fix). So the 12-second flag set at login stayed active even
across an explicit, deliberate sign-out. If a user opened the sidebar and
tapped Logout within that window (exactly what a fresh post-crash-fix
verification pass would naturally do), `signOut()` correctly cleared every
provider's session — but the still-active grace flag made both auth guards
treat the resulting `isLoggedIn=false` as a flap to recover from, not a real
sign-out, and their `authService.getSession()` recheck could resolve a
still-lingering provider session (sign-out over a flaky native transport has
no hard guarantee of finishing everywhere first) and silently re-authenticate
the user — right as `router.replace('/')` was sending them to `/`, which
would then redirect them straight back into the dashboard. Net effect: tap
Logout, screen flashes, you're still logged in.

**Fix**: `apps/mobile-app/hooks/useAuth.ts` `signOut()` now calls
`clearRecentAuthSuccess()` first, before any provider sign-out begins — so
by the time `isLoggedIn` flips false, no guard can mistake it for a
recoverable flap.

**Test**: `apps/mobile-app/tests/auth/useAuth-native-google.test.tsx` —
"clears the recent-auth grace flag on sign-out, so the auth guards cannot
resurrect the just-cleared session". Marks recent-auth success (simulating
a just-completed login), signs out, and asserts the flag is cleared.
Verified failing against the pre-fix code (`hasRecentAuthSuccess()` stayed
`true` after `signOut()`) and passing with the fix.

## Bug 2 (fixed, not unit-testable): Sidebar mispositioned on some devices

**Root cause**: `apps/mobile-app/index.js` never called
`I18nManager.allowRTL(false)`/`forceRTL(false)`. Android auto-detects RTL
layout direction from the device's system language before any JS runs, and
React Native's Yoga layout engine silently mirrors every
`flexDirection: 'row'` style once `I18nManager.isRTL` is true — no crash, no
warning. The dashboard drawer's branding row (`brandingContainer`) and
quick-actions row (`quickTogglesRow`) in
`app/(shared)/dashboard/_layout.tsx` are both `flexDirection: 'row'`. This
app only ships LTR locales (en/es/ko — see `handleLanguageToggle`) and has
no screens designed to mirror, so any device with an RTL system language
(independent of the app's own in-app language toggle) would silently render
these rows reversed/offset — exactly a "some devices, not others" symptom
with no error signal.

This most likely also explains bug 3 below: `@react-navigation/drawer`
derives `direction` from `useLocale()` and uses it to pick gesture/overlay
math (see `DrawerViewBase` in
`node_modules/@react-navigation/drawer/src/views/DrawerView.tsx`), while
this app's `screenOptions` explicitly force `drawerPosition: 'left'`
regardless of `direction`. On a device where the OS reports RTL but the
panel is pinned LTR by explicit config, the overlay/gesture math and the
actual rendered panel position can disagree about which side is "open" vs
"outside" — which would make backdrop-tap-to-close unreliable specifically
on the same RTL-locale devices affected by bug 2, not universally.

**Fix**: `apps/mobile-app/index.js`, immediately after the fatal-error
handler install and before the URLSearchParams/native-event-registry
polyfills: if `I18nManager.isRTL`, call `allowRTL(false)` and
`forceRTL(false)`.

**Not unit-tested**: consistent with the existing sibling polyfill installs
in the same file (URLSearchParams, native-event-registry), which also have
no direct test at the `index.js` call-site level — only the underlying
modules are tested where they have real logic. This one-line guard has none
to isolate.

**Known limitation, not a bug in this fix**: `I18nManager.forceRTL()`
persists the LTR preference natively, but Android needs one full app
restart to visually apply a *change* in direction (a long-standing RN
platform limitation, not specific to this fix). A device that already
launched this app once under RTL may need one relaunch after upgrading to
pick this up cleanly; every fresh install/launch after this ships gets LTR
immediately.

## Bug 3 (not independently fixed — needs live verification): outside-tap-to-close

No additional code-level cause was found beyond the RTL/direction mismatch
theory in bug 2. `react-native-drawer-layout`'s `Overlay.native.tsx` (the
backdrop that closes the drawer on tap) is standard, widely-used library
code — its `pointerEvents`/`onPress`-to-close behavvior is not something
this app overrides or disables anywhere in
`app/(shared)/dashboard/_layout.tsx`. `getDrawerWidthNative` and
`Drawer.native.tsx` both resolve width live via `useWindowDimensions()`, not
a stale `Dimensions.get()` snapshot, so a width/position calculation race
was ruled out as a cause.

**Next step if this persists after the RTL fix ships**: reproduce on a real
device or emulator with `adb logcat`, per
`local-android-debugging.md`, specifically on a device with an RTL system
language set (to test the bug-2/bug-3 link) and on one with a plain
en-US locale (to see if it's already gone). Do not assume this is fixed
without that check — this project's own history
(`drawer-navigation-gotchas.md`) has repeatedly shown static reading alone
misses the real cause for exactly this class of silent Android touch/layout
bug.
