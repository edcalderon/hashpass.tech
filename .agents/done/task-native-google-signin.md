# Native Google Sign-In (No-Browser Flow)

**Status:** ✅ DONE  
**Priority:** Medium  
**Created:** 2026-06-22  
**Completed:** 2026-06-23  
**Release:** v1.8.94

## Goal

Add native Google Sign-In SDK as the **primary path** on Android, with the existing
`WebBrowser.openAuthSessionAsync` flow kept intact as the **fallback**. Both flows must
coexist; switching back to browser-only takes a single env-var change with no code
removal required.

## Architecture — dual-mode, feature-flagged

```
signInWithOAuth('google') on native Android
  │
  ├─ EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=true  →  GoogleSignin.signIn() → idToken → supabase.signInWithIdToken()
  │                                            (no browser, no redirect, no deep-link)
  │
  └─ EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=false (or absent)  →  WebBrowser.openAuthSessionAsync()
                                              (current browser-based flow, unchanged)
```

Non-Google providers (GitHub, Facebook, Twitter) are unaffected — they always use
the browser path because there is no equivalent SDK for them.

## Current browser-based flow (keep, do not remove)

File: `apps/mobile-app/hooks/useAuth.ts` lines ~295–338

```ts
if (Platform.OS !== 'web' && result.oauthUrl) {
  const browserResult = await WebBrowser.openAuthSessionAsync(result.oauthUrl, callbackUrl);
  // ... createSessionFromUrl / handleOAuthCallback ...
}
```

This block stays exactly as-is. The native SDK path is added as a short-circuit
**before** this block runs, inside a feature-flag guard.

---

## Step-by-step implementation

### Step 1 — Install the SDK (native build only)

```bash
npx expo install @react-native-google-signin/google-signin
```

- This is a bare native module. A new EAS/Gradle build is required before it works.
- `expo-web-browser` remains in package.json — it is still used for the fallback and
  for non-Google providers.

---

### Step 2 — Google Cloud Console setup

1. Open [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials.
2. Create **Android OAuth 2.0 Client ID**:
   - Package name: `com.hashpass.tech`
   - SHA-1: run `keytool -list -v -keystore config/hashpass-release.keystore` and copy
     the `SHA1` fingerprint (same keystore used by Fastlane).
3. Note the existing **Web Client ID** (type = Web application) — this is the
   `webClientId` needed by the SDK; it is NOT the Android client ID.
4. Confirm the Supabase Google provider (Authentication → Providers → Google) uses
   this same Web Client ID + secret.

---

### Step 3 — Add env var flag

In `apps/mobile-app/.env.example` add:
```
# Set to true to use native Google Sign-In SDK (no browser). Requires a fresh native build.
EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=false
```

In the Android release CI (`.github/workflows/mobile-android-release.yml`), add to
the env-file block (around line 448):
```bash
[ -n "${EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN:-}" ] && \
  printf 'EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=%s\n' "$EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN" >> "$env_file"
```

And expose the secret in the workflow `env:` block:
```yaml
EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN: ${{ vars.EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN }}
```

Set `EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=true` in GitHub Actions → Settings → Variables
only when ready to ship the native flow.

---

### Step 4 — Add `app.json` plugin (only when flag is enabled)

In `apps/mobile-app/app.json`, in the `plugins` array:
```json
["@react-native-google-signin/google-signin", {
  "iosUrlScheme": "com.googleusercontent.apps.YOUR_IOS_CLIENT_ID"
}]
```

`iosUrlScheme` is only required if iOS support is added later; for Android-only it can
be omitted. The plugin writes the necessary `google-services.json` entries and
AndroidManifest changes at build time.

---

### Step 5 — Configure SDK at app startup

File: `apps/mobile-app/app/_layout.tsx` (or `app/(shared)/dashboard/_layout.tsx`)

```ts
import { Platform } from 'react-native';

// Only import when the module exists (native build with SDK installed)
const NATIVE_GOOGLE_ENABLED =
  Platform.OS !== 'web' &&
  process.env.EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN === 'true';

useEffect(() => {
  if (!NATIVE_GOOGLE_ENABLED) return;
  // Lazy import keeps the module out of web/fallback bundles
  import('@react-native-google-signin/google-signin').then(({ GoogleSignin }) => {
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
    });
  });
}, []);
```

Add `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to `.env.example` and the CI env block.

---

### Step 6 — Add native SDK path in `useAuth.ts`

File: `apps/mobile-app/hooks/useAuth.ts`, function `signInWithOAuth` (line ~295).

Insert **before** the existing `WebBrowser` block:

```ts
// ── Native Google Sign-In (SDK path, feature-flagged) ──────────────────────
const nativeGoogleEnabled =
  Platform.OS !== 'web' &&
  provider === 'google' &&
  process.env.EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN === 'true';

if (nativeGoogleEnabled) {
  const { GoogleSignin, statusCodes } = await import(
    '@react-native-google-signin/google-signin'
  );
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken ?? userInfo.idToken;
    if (!idToken) throw new Error('Google Sign-In did not return an ID token.');

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) throw error;
    return { pending: true };
  } catch (err: any) {
    // User cancelled — don't show error toast
    if (err.code === statusCodes.SIGN_IN_CANCELLED) return { pending: false };
    // Play Services unavailable — fall through to browser flow
    if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      console.warn('Play Services unavailable, falling back to browser OAuth');
      // fall through to WebBrowser block below
    } else {
      throw err;
    }
  }
}
// ── End native Google Sign-In ───────────────────────────────────────────────

// Existing browser-based flow (unchanged):
if (Platform.OS !== 'web' && result.oauthUrl) {
  // ... WebBrowser.openAuthSessionAsync ...
}
```

The dynamic `import()` means `@react-native-google-signin/google-signin` is NOT
bundled when `EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN` is false, keeping the web/fallback
build clean.

---

### Step 7 — Rollback procedure

To revert to browser-only without any code change:

1. Set `EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=false` in GitHub Actions variables (or remove
   the variable entirely).
2. Trigger a new CI build — no code PR needed.

For an emergency rollback of an already-shipped build, set the variable to `false`
and trigger a hotfix release.

---

### Step 8 — Test checklist

**Native SDK path (flag = true, new native build):**
- [ ] Tap "Continue with Google" → account picker bottom sheet appears **without** opening a browser
- [ ] Select account → sign-in completes and navigates to dashboard
- [ ] Sign-out then sign-in again works
- [ ] Cancelling the picker closes gracefully (no error toast)
- [ ] On a device without Play Services, falls back to browser flow automatically

**Browser fallback (flag = false OR SDK not installed):**
- [ ] Tap "Continue with Google" → Chrome Custom Tab opens (existing behavior)
- [ ] Sign-in completes via deep-link redirect
- [ ] `handleOAuthCallback` / `createSessionFromUrl` path still works

**Unchanged paths:**
- [ ] Web (`Platform.OS === 'web'`) Google sign-in unaffected
- [ ] GitHub / Facebook / Twitter OAuth unaffected (always browser)
- [ ] OTP flow unaffected
- [ ] Directus `handleOAuthCallback` path unaffected

---

## Files to change

| File | Change |
|------|--------|
| `apps/mobile-app/hooks/useAuth.ts` | Add native SDK short-circuit before `WebBrowser` block; existing block untouched |
| `apps/mobile-app/app.json` | Add `@react-native-google-signin/google-signin` plugin |
| `apps/mobile-app/app/_layout.tsx` | Add `GoogleSignin.configure()` inside `useEffect` guarded by flag |
| `apps/mobile-app/.env.example` | Add `EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| `.github/workflows/mobile-android-release.yml` | Expose both new env vars to the build |

**Do NOT change:**
- The `WebBrowser.openAuthSessionAsync` block — left intact as fallback
- Web auth flow — untouched
- Non-Google provider paths — untouched

---

## Notes

- Requires a **new native build** to activate (bare native module).
- The dynamic `import()` in Step 6 prevents the SDK from loading in web or when the
  flag is off — no bundle-size impact for those paths.
- `webClientId` must be the **Web** OAuth client ID, not the Android one.
- SHA-1 fingerprint in Google Cloud must exactly match the release keystore used by
  Fastlane (`config/hashpass-release.keystore`).
- Both debug and release SHA-1 fingerprints should be registered in Google Cloud
  Console to support local Gradle testing.
