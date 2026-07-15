# Local Android Debugging (Emulator + Local Gradle Build)

A faster loop than the CI/Play Store cycle for reproducing and verifying
native-level Android bugs (crashes, navigation issues, anything that
depends on the actual compiled app, not just JS logic): build a real
release-mode APK locally, install it on a local emulator, and read
`adb logcat` directly. Full CI/Play Store dispatch is still the ground
truth for a release, but this loop turns a multi-minute-per-attempt CI
cycle into a few minutes per attempt, entirely offline from the release
pipeline.

## When to use this vs. the CI pipeline

Use this loop to **diagnose and verify a fix** before it ever reaches CI.
Still dispatch the real Android release workflow (see
[RELEASE_WORKFLOW.md](../release/RELEASE_WORKFLOW.md)) before considering
anything actually shipped — this loop doesn't touch signing, Play Console,
or the EC2 runner, and a local debug-signed build is not the same
artifact users receive.

## One-time environment setup

```bash
export ANDROID_HOME=/usr/lib/android-sdk
export ANDROID_SDK_ROOT=/usr/lib/android-sdk
export JAVA_HOME=/home/ed/.sdkman/candidates/java/17.0.19-tem  # AGP requires Java 17, not 11
export PATH="$JAVA_HOME/bin:$PATH"
```

Confirm an emulator is running: `adb devices -l`. If none is running, start
one from Android Studio's AVD manager or `emulator -avd <name>`.

## Building: release mode, not debug

```bash
pnpm --dir apps/mobile-app exec expo prebuild --platform android --clean
cd apps/mobile-app/android
./gradlew assembleRelease -q
```

**Use `assembleRelease`, not `assembleDebug`, for anything you're trying to
reproduce faithfully.** Debug builds connect to a Metro dev server and can
hit dev-mode-only code paths that don't exist in the real, minified,
Hermes-bundled release build users actually get — a debug-mode crash or
non-crash doesn't tell you what a release build will do. This app's
`android/app/build.gradle` signs `release` with the debug keystore
locally (`signingConfig signingConfigs.debug`), so `assembleRelease`
installs cleanly without needing production signing credentials.

Run `expo prebuild --clean` before the local Gradle build when validating
the latest native release. The generated `android/` project is gitignored,
so it can keep an older `versionName` or `versionCode` from a previous
release. A direct Gradle build then succeeds but installs the stale native
project, which makes emulator debugging look like it is testing the latest
deployment when it is not.

Before installing, confirm the local APK metadata matches the deployment
you mean to test:

```bash
cat apps/mobile-app/android/app/build/outputs/apk/release/output-metadata.json
```

The APK lands at
`apps/mobile-app/android/app/build/outputs/apk/release/app-release.apk`.
First builds fetch fresh Maven artifacts and can take several minutes;
subsequent builds are faster once Gradle's cache is warm.

## Installing

```bash
adb -s <device> install -r app-release.apk
```

If the previously-installed build was signed differently (e.g. a real
Play Store / CI build vs. this locally debug-signed one), `install -r`
fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. You must
`adb uninstall com.hashpass.tech` first — **this wipes the app's local
storage, including any persisted session**, so plan to either re-login or
use the dev auth bypass (below) afterward.

## Reproducing and reading crashes

```bash
adb -s <device> logcat -c                              # clear old logs first
adb -s <device> shell am force-stop com.hashpass.tech
adb -s <device> shell monkey -p com.hashpass.tech -c android.intent.category.LAUNCHER 1
# ...reproduce the issue...
adb -s <device> logcat -d 2>&1 | grep -iE "FATAL EXCEPTION|ReactNativeJS"
```

For a fatal native crash, look for `FATAL EXCEPTION` in an `AndroidRuntime`
line — that's the real stack trace, not the JS-side `console.error` that
usually precedes it by a few hundred milliseconds. See
[native-module-version-pinning.md](./native-module-version-pinning.md) for
the specific `"Unsupported top level event type"` crash signature.

**Timing matters**: if a crash happens some seconds after a screen
mounts (not immediately), don't assume the first suspicious log line
near the crash timestamp is the cause — pull a wider unfiltered window
(`logcat -v time`, filtered by timestamp range rather than tag) and check
what's *actually* still executing right before the crash, since async
JS/native interleaving can put unrelated log lines right next to the real
trigger.

## Deep-linking to a specific screen

```bash
adb -s <device> shell am start -W -a android.intent.action.VIEW -d "hashpass://dashboard/explore" com.hashpass.tech
```

**Cold-start gotcha**: if the app isn't already running, the very first
deep-link intent after a fresh launch/install is often consumed as a plain
launch (opening to the default route) instead of actually routing —
Expo Router's linking isn't ready yet when the intent arrives. Launch the
app plainly first (`monkey -c android.intent.category.LAUNCHER`), wait a
few seconds, *then* send the deep link as a second, separate command once
the app is confirmed running (`adb shell am start ...` against an
already-running app logs `"Warning: Activity not started, intent has been
delivered to currently running top-most instance"` — that's the success
case here, not an error).

## Validating login paths locally

Local `assembleRelease` builds are signed with the debug keystore, so the
native Google sign-in client can fail before the app receives an ID token
when the OAuth client certificate does not match that local signing cert.
Use OTP to validate the post-login dashboard path in that case. If the app
reaches the logged-in dashboard and stays alive, treat non-fatal provider
bootstrap logs such as `Better Auth getSession error: TypeError: Network
request failed` as a separate follow-up instead of conflating them with the
native dashboard crash signature.

## Reaching screens behind the login gate, without a real session

Real OTP/magic-link login requires either a deliverable email/SMS or
direct database access to read the generated code — both are more
friction than most local debugging needs. `lib/auth/dev-bypass.ts`
provides a dev-only bypass, gated so it can never affect a real user:

```bash
# In apps/mobile-app/.env.local (gitignored, never committed):
EXPO_PUBLIC_DEV_AUTH_BYPASS=true
```

`isDevAuthBypassEnabled()` requires **both** `__DEV__` (false in every
release build, regardless of this env var) **and** the explicit opt-in
above. This means:

- It has zero effect in a real `assembleRelease` build, by design — a
  release build always has `__DEV__ === false`, so this flag cannot leak
  into a shipped build no matter what's in `.env.local`.
- To actually exercise the bypass, you need a **debug** build connected to
  Metro (`assembleDebug` + `adb reverse tcp:8081 tcp:8081` +
  `npx expo start`), not a release build. This is the one case where the
  debug-vs-release distinction above flips: verifying the auth-guard logic
  itself needs `__DEV__ === true`; verifying anything else (crashes,
  rendering, navigation) needs a release build.
- With the bypass active, `user` stays `null` — anything that depends on
  a real user object (profile data, admin checks, personalized content)
  will render its empty/loading state, not crash. If you need a screen
  populated with realistic data, request a data-mocking pass instead of
  assuming the bypass alone is sufficient.
- Reach a gated screen with the bypass on via deep link (see above) —
  the guard is what would otherwise redirect you to `/auth`.

## Testing the web build for a runtime-only bug

A successful `npm run build:web` does **not** mean the bundle runs
correctly — build success just means the code parsed and bundled; some
bugs (e.g. circular-import bindings resolving to `undefined`) only
manifest when the minified JS actually executes in a browser. Build,
serve, and load it for real:

```bash
npm run build:web
npx serve -l <port> dist/client   # or: cd dist/client && npx serve -l <port>
```

Then load `http://localhost:<port>/` in a real browser context (PinchTab,
`agent-browser`, or a normal browser) and check for a startup error, not
just that the server returned 200. See
[native-module-version-pinning.md](./native-module-version-pinning.md)'s
third incident for a concrete example of a bug that only a loaded-page
check (not a build check) would catch.

## Patching a dependency instead of changing its version

If a version pin required for one platform breaks another, don't resolve
it by picking a version — see the "Open risk" and version-pinning
guidance in
[native-module-version-pinning.md](./native-module-version-pinning.md).
Use `pnpm patch <package>@<version>`, edit the files under the printed
temp directory, `pnpm patch-commit <path>` to persist it (writes
`patches/<package>@<version>.patch` and registers it in
`pnpm.patchedDependencies` in `package.json`). Check the target package's
own `package.json` `main`/`module`/`react-native` fields before patching,
to scope the patch to only the platform(s) actually affected — patching
files a given platform never reads is free extra safety margin, not
wasted effort.
