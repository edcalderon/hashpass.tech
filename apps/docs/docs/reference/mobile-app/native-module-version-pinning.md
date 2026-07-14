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

## Why: three production crash incidents from version drift

**v1.8.4–v1.8.8 (expo-image and friends):** five bundled-module mismatches
produced `java.lang.NoSuchMethodError` on Android startup. Fixed in v1.8.9
by aligning versions.

**v1.8.196–v1.8.204 (react-native-svg, first occurrence):** a `^15.11.2`
caret range let pnpm resolve react-native-svg **15.15.3**, while Expo SDK
53 certifies **15.11.2**. 15.12+ ships new native layout-event plumbing
(`SvgOnLayoutEvent`, event name `topSvgLayout`) built for newer React
Native. On this app's RN 0.79.2 + `newArchEnabled` build, the JS-side view
configs don't recognize those events, so the Fabric event pipeline threw a
fatal `Unsupported top level event type "topLayout"/"topSvgLayout"
dispatched` the moment any svg view reported layout — killing the app on
every dashboard mount. Because Google sign-in redirects to the dashboard,
this masqueraded for days as a "Google auth crash" and survived two
unrelated fixes (URLSearchParams global locking, react-native-copilot's
unconditional `onLayout` hack) that each removed real-but-secondary crash
sources. Fixed in v1.8.205 by pinning 15.11.2 exactly.

**v1.8.206–v1.8.218 (react-native-svg, regression — the pin didn't hold):**
8 minutes after v1.8.205 shipped the 15.11.2 pin, commit `71e24194a` bumped
it back to **15.12.1** to fix a real, separate web-only crash: 15.11.2's
`web/utils/prepare.js` imports `hasTouchableProperty`/`parseTransformProp`
through a barrel file (`web/utils/index.js`) with a circular reference
that resolves to `undefined` under this app's Metro web bundler +
minification, throwing `TypeError: n.hasTouchableProperty is not a
function` on every page. That commit's own message documents diffing
15.12.1's Android sources against 15.11.2 file-by-file to confirm the
Android fix was preserved before shipping the bump. **That verification
method was insufficient** — reproduced live via `adb logcat` in a
2026-07-13 session that this pin regressed the exact same Android
`"topLayout"` crash on 15.12.1, meaning 15.11.2 and 15.12.1 each broke a
different platform, and a source-file diff of the vendor's Android code
didn't catch it. The actual mechanism is likely Fabric codegen alignment
with Expo's exact certified version string, not anything visible in the
vendor's own Android source tree — diffing native `.java`/`.kt` files
doesn't rule this class of mismatch out.

Fixed properly in v1.8.219 by **not choosing between the two versions**:
pinned back to the Expo-certified 15.11.2 (fixes Android) and added a
`pnpm patch` (`patches/react-native-svg@15.11.2.patch`) that backports
upstream's own 15.12.0 restructuring — moving `hasTouchableProperty` and
`parseTransformProp` into their own dedicated modules, breaking the
circular import — onto 15.11.2 (fixes web, without moving off the
certified version at all). Verified the patch only touches
`lib/module/` and `lib/commonjs/` (the web build output); Android
resolves this package via the separate `react-native` field in
`package.json`, pointing at raw `src/`, which the patch never touches.

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
   `adb logcat -d -b crash`. See
   [local-android-debugging.md](./local-android-debugging.md) for the full
   local build + emulator + logcat workflow.
5. **Diffing the vendor's native source files between two versions is not
   sufficient verification that a version bump is native-crash-safe** —
   the second incident above shipped with exactly that verification and
   still regressed. Only a real on-device reproduction (build the release
   APK, install, navigate, read logcat) confirms a fix or rules out a
   regression.
6. If the certified version breaks a *different* platform (as it did here
   for web), don't resolve the conflict by picking a version — the version
   pin exists because Expo's certification is what makes the native side
   trustworthy, and moving off it reopens the class of bug this doc
   exists to prevent. Patch the specific broken code path on top of the
   certified version instead (`pnpm patch <pkg>@<version>`), scoped as
   narrowly as possible, and verify which platform(s) the patched files
   are actually reachable from (`main`/`module`/`react-native` fields in
   the package's own `package.json`) before assuming a patch is safe for
   a platform you haven't tested.

## Open risk: this has now drifted twice on the same file

Both prior incidents were manual version changes that nobody cross-checked
against this document or the drift-check script before shipping. There is
currently no automated enforcement — a future `package.json` change (e.g.
another "fixes X on platform Y" bump) could silently reintroduce this
again. Consider adding the drift-check script as a CI step gated on
`package.json` changes, so a mismatch fails the PR instead of shipping and
waiting to be noticed on a real device.
