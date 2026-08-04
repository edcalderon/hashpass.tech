# Update-check UI: web label fix + native "update available" modal (v1.8.317)

There are three distinct update surfaces in this app and it's easy to
conflate them:

| Surface | What it updates | Where it's implemented |
|---|---|---|
| **OTA (JS bundle)** | The Expo/EAS-published JS bundle, native binary unchanged | `hooks/useOtaUpdate.ts`, `OtaUpdateBanner` — see [eas-update-ota.md](./eas-update-ota.md) |
| **Web app version** | The deployed web bundle (hashpass.tech/bsl.hashpass.tech) | `lib/version-checker.ts`, `VersionUpdateNotification` (web branch), `VersionQuickSheet` |
| **Native store version** | The installed Android/iOS binary itself | `hooks/useNativeUpdateCheck.ts`, `VersionUpdateNotification` (native branch, added this change) |

This doc covers the web and native-store surfaces — the ones driven by
`GET /config/versions` and the version-drawer UI (`VersionQuickSheet`,
`VersionInfoDrawer`, `VersionUpdateNotification`), not OTA.

## What was wrong

1. **Web labels said "Play Store" unconditionally.** `VersionQuickSheet`'s
   check-for-updates button, its "checking…" state, and its "up to date"
   state all hardcoded Play Store wording (`t('playCheck', 'Check for Play
   Store updates')`, etc.) regardless of `Platform.OS`. On web this is
   simply wrong — the web build has no Play Store to check; the button
   actually re-checks the deployed web bundle version. Now
   `checkLabel`/`checkingLabel`/`upToDateLabel` branch on `Platform.OS ===
   'web'` and use generic wording (`t('webCheck', 'Check for updates')`,
   etc.) there instead.

2. **Web's "Update" button used a plain reload().** `VersionQuickSheet`'s
   `handleOpenStore` web branch called `window.location.reload()` directly.
   The *forced*-update path in `lib/version-checker.ts` deliberately never
   trusts a plain reload for this — `performHardReload()`'s own comment
   explains why: a same-URL reload can still be answered by the browser's
   HTTP disk cache, a stale bfcache entry, or a service worker's
   fallback-cache path even right after `unregister()`. `handleOpenStore`
   now calls the same `clearAllCaches()` + `performHardReload()` (the
   latter navigates to the same URL with a fresh `?_hpv=<timestamp>`, a URL
   no cache layer has ever seen — see
   [CDN_CACHE_BUSTING_HPV.md](../../infra/CDN_CACHE_BUSTING_HPV.md) for the
   CDN-side half of that same cache-busting mechanism). `clearAllCaches` is
   now exported from `version-checker.ts` for this reuse.

3. **Native had no real "update available" dialog, only a small pill.**
   `useNativeUpdateCheck()` already computed `needsSoftUpdate` correctly,
   but the only UI wired to it (`SoftUpdateBanner`) was a small dismissible
   bottom pill/toast — nothing resembling a real modal dialog the way the
   Play Store's own "Update available" prompt (or, e.g., Binance's app)
   looks: centered card, icon, current→latest version comparison,
   Update/Later actions.

## The fix

`VersionUpdateNotification` (previously web-only — it early-returned `null`
on native) is now cross-platform and is the single component both surfaces
use:

- **Removed the `Platform.OS !== 'web'` early return.**
- **Replaced the inline `<svg>`/`<path>` elements** (valid JSX on web via
  react-native-web, but not valid React Native host components) **with
  `MaterialIcons`** (`system-update`, `arrow-forward`) so the same JSX tree
  renders on both platforms.
- **Replaced web-only `boxShadow` style strings** with
  `Platform.OS === 'web' ? {boxShadow: ...} : {shadowColor, shadowOffset,
  shadowOpacity, shadowRadius}` pairs (native `StyleSheet` has no
  `boxShadow` property).
- **`handleUpdate` now branches by platform**: web keeps the
  clear-cache-and-hard-reload flow; native opens the Play/App Store link
  (same `market://`-first-then-`https://` fallback pattern
  `VersionQuickSheet` already used via `Linking.canOpenURL`), then calls
  `onUpdateComplete` to dismiss — there's nothing to reload in place on
  native, the user completes the actual install from the store app.
- **New optional props**: `storeUrl` / `storeWebUrl`, native-only.

`app/_layout.tsx` now renders this same modal for native soft-updates
instead of `SoftUpdateBanner` (deleted — it had no other callers), gated on
`nativeUpdate.needsSoftUpdate` and a per-version dismissal check against
`AsyncStorage['soft_update_dismissed_version']` (the same key/semantics the
old banner used, so a user who already dismissed a version's prompt still
doesn't see it again after this change).

## Files touched

- `components/VersionQuickSheet.tsx` — platform-aware labels, real
  cache-clearing web reload.
- `components/VersionUpdateNotification.tsx` — native-compatible now;
  handles both the web reload flow and the native store-link flow.
- `components/SoftUpdateBanner.tsx` — deleted (superseded).
- `lib/version-checker.ts` — exported `clearAllCaches`.
- `app/_layout.tsx` — native soft-update now renders
  `VersionUpdateNotification` instead of `SoftUpdateBanner`, with
  AsyncStorage-backed per-version dismissal tracking.

## Why not the real Google Play "In-App Updates" API

Android has an official Play Core "in-app update" API (immediate/flexible
flows) that would trigger Google's own native update UI. This wasn't used
here: it requires a new native module/config plugin, which means a full
native rebuild and a fresh Play Store submission just to test it — a much
larger and riskier change than a JS-only modal. The custom modal
intentionally uses HASHPASS's own icon/branding rather than reproducing
Google Play's actual logo or wordmark, both to avoid a real trademark
concern and because this repo's app already has its own consistent
version-modal design (shared with the web build) to match.
