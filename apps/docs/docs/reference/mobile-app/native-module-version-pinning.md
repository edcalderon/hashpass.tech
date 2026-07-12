# Native Module Version Pinning

## Policy

Every package listed in Expo's `bundledNativeModules.json` must resolve to
the exact version (or range) Expo certifies for the installed SDK. Declare
these packages with **exact versions** (no `^` or `~`) in both
`apps/mobile-app/package.json` **and** the root `package.json` when both
declare them, so a single resolution exists workspace-wide and Android
autolinking can never pick a second copy.

Check for drift at any time:

```bash
node -e "
const bundled = require('./node_modules/expo/bundledNativeModules.json');
const path = require('path');
const semver = require(path.join(process.cwd(), 'node_modules', 'semver'));
for (const [pkg, range] of Object.entries(bundled)) {
  let actual;
  try { actual = require(path.join(process.cwd(), 'node_modules', pkg, 'package.json')).version; } catch { continue; }
  try { if (!semver.satisfies(actual, range)) console.log(pkg + ': installed=' + actual + ' expected=' + range); } catch {}
}
"
```

## Why: two production crash incidents from version drift

**v1.8.4–v1.8.8 (expo-image and friends):** five bundled-module mismatches
produced `java.lang.NoSuchMethodError` on Android startup. Fixed in v1.8.9
by aligning versions.

**v1.8.196–v1.8.204 (react-native-svg):** a `^15.11.2` caret range let pnpm
resolve react-native-svg **15.15.3**, while Expo SDK 53 certifies
**15.11.2**. 15.12+ ships new native layout-event plumbing
(`SvgOnLayoutEvent`, event name `topSvgLayout`) built for newer React
Native. On this app's RN 0.79.2 + `newArchEnabled` build, the JS-side view
configs don't recognize those events, so the Fabric event pipeline threw a
fatal `Unsupported top level event type "topLayout"/"topSvgLayout"
dispatched` the moment any svg view reported layout — killing the app on
every dashboard mount. Because Google sign-in redirects to the dashboard,
this masqueraded for days as a "Google auth crash" and survived two
unrelated fixes (URLSearchParams global locking, react-native-copilot's
unconditional `onLayout` hack) that each removed real-but-secondary crash
sources. Fixed in v1.8.205 by pinning 15.11.2 exactly; the crash surface
does not exist in that version's native sources.

## Debugging this class of crash

Signature: `com.facebook.react.common.JavascriptException: Error:
Unsupported top level event type "top<Something>" dispatched` in
`adb logcat -b crash`, thrown from `extractEvents` on thread `mqt_v_native`.

1. Run the drift check above **first** — before reading any JS code.
2. The event name hints at the owner: `topSvgLayout`/`topDetached` →
   react-native-svg; other `top*` names → grep `node_modules/*/android` for
   the `EVENT_NAME`.
3. A mismatched module means the JS view config and the native ViewManager
   disagree about which events exist. Pinning the certified version fixes
   it; patching JS listeners does not (the native side still dispatches).
4. Reproduce deterministically before claiming a fix: install the release
   build, `adb logcat -c`, navigate to the crashing screen, read
   `adb logcat -d -b crash`.
