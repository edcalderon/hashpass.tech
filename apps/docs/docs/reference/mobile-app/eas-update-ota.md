# EAS Update (OTA): Shipping JS Changes Without a Play Review

## Default posture (2026-07-28): OTA unless a native rebuild is actually required

Every mobile release is OTA-only by default. A native
`mobile-android-release.yml` build only runs when
`packages/tools/scripts/detect-mobile-native-change.js` — the guard
described below — actually detects a native-sensitive change. This flips the
previous default (every release triggered the full internal->alpha->beta
native chain) to: ship JS continuously via OTA, and only pay for a native
build when the diff genuinely needs one.

## Summary

`expo-updates` (added 2026-07-28) lets JS/asset-only mobile changes reach
installed app binaries directly, without going through
`mobile-android-release.yml` or a Play Store review. It does not replace
fastlane — fastlane still builds and submits every `.aab` exactly as before.
OTA only republishes the JS bundle that an already-shipped binary fetches at
runtime. The two systems are orthogonal and can be adopted without touching
each other.

This is unrelated to the existing `config/update-policy.json` /
`hooks/useNativeUpdateCheck.ts` mechanism, which is a **native version gate**
(blocks/prompts users on an outdated Play binary). OTA is a **JS bundle
delivery** mechanism. They answer different questions and don't conflict.

## What becomes OTA-eligible vs. what still needs a native release

OTA-eligible (JS/TS/asset changes — the vast majority of day-to-day commits):
screens, components, hooks, business logic, styles, copy, most `lib/` and
`config/*.ts` changes, shared `@hashpass/*` workspace packages consumed by the
mobile bundle (`auth`, `backend`, `config`, `emails`, `types`, `ui`, `utils`).

Still requires a real `mobile-android-release.yml` build:
- Any native module add/upgrade, or a `package.json` dependency change in
  general (a version bump can pull in a new native module transitively).
- `app.json` / `app.config.js` / `eas.json` / `plugins/**` / `android/**`.
- New permissions, icon/splash, Expo SDK upgrade.

`.github/workflows/mobile-eas-update.yml` enforces this boundary with a
**positive path allowlist** (not `paths-ignore` — GitHub Actions doesn't allow
combining both on one trigger, and an allowlist is safer by default: a new
native-sensitive file added later doesn't silently start matching). See the
comment block at the top of that workflow for the exact list and reasoning.
That allowlist is the coarse, static first pass; the guard described next is
the precise, dynamic decision that actually gates both what ships as OTA and
what triggers a native build.

## Automatic native-change guard

`packages/tools/scripts/detect-mobile-native-change.js` is the single source
of truth both release workflows defer to. It diffs two git refs and reports
whether anything under these paths changed:

- `apps/mobile-app/android/**`, `apps/mobile-app/ios/**`, `apps/mobile-app/plugins/**`, `apps/mobile-app/fastlane/**` — any diff here always counts.
- `apps/mobile-app/app.config.js`, `apps/mobile-app/eas.json`, `apps/mobile-app/Gemfile[.lock]`, `apps/mobile-app/config/google-services.json`, `apps/mobile-app/config/amplifyconfiguration.json`, `apps/mobile-app/react-native.config.js` — same, any diff counts.
- `package.json` (root) and `apps/mobile-app/package.json` — **structurally** diffed on just `dependencies`/`devDependencies`, ignoring everything else. Raw whole-file diffing would be useless here: the release version bump touches `"version"` in both files on literally every release (see `versioning.config.json`'s `syncFiles`), so a naive diff would always report "changed."
- `apps/mobile-app/app.json` — same idea: structurally diffed ignoring `expo.version` and `expo.android.versionCode`, since `packages/tools/scripts/update-version.mjs` rewrites both of those on every release too. Any other change to this file (permissions, plugins list, `android`/`ios` blocks) still counts.

It's invoked in two different modes, at two different granularities:

- **`--tag <newTag>`** (release granularity) — used by `mobile-release-on-tag.yml`. Diffs the new tag against the previous `v*.*.*` tag. No previous tag (first-ever release) defaults to `needsNative: true` — can't verify safety, and for an actual release the worse failure mode is skipping a native build that was needed, not the reverse.
- **`--from <sha> --to <sha>`** (single-push granularity) — used by `mobile-eas-update.yml`. Diffs one push's commit range (`github.event.before` -> `github.sha`). An unresolvable range (new branch's first push, force-push, the null SHA `000...000`) defaults to *skipping* the OTA publish rather than guessing — for a single push the safe default is "don't publish this one," since the very next resolvable push will catch it, whereas guessing could ship something unverified.

Both modes share the same `detectBetweenRefs()` core, so the two workflows
can never disagree about what counts as "native" — there's exactly one
definition, applied at two different scopes.

**Known limitation:** `pnpm-lock.yaml` is intentionally not diffed. A
dependency bump that changes only the lockfile's resolved transitive
versions (without touching `apps/mobile-app/package.json`'s own
`dependencies`/`devDependencies` entries) won't be caught. This is
considered rare enough not to be worth the complexity of lockfile parsing
today — flagged here so it isn't mistaken for an oversight later.

### Forcing a native release despite the guard

Re-run `.github/workflows/mobile-release-on-tag.yml` manually
(`workflow_dispatch`) with `force_native_release=true` to skip the diff check
entirely and dispatch `mobile-android-release.yml` as if native changes were
found — useful for a deliberate store-visibility release, or if you don't
trust the guard's verdict for one specific release. There's no equivalent
force-publish override on the OTA side: if the guard skips an OTA publish for
a push, that push's JS ships on the next release instead (either the next
resolvable OTA-eligible push, or folded into whatever native build ships
next) rather than being force-published somewhere unsafe.

## Channel model: environment, not track

The OTA channel is bound to which API backend a binary points at
(`environment=development` -> `api-dev.hashpass.tech`,
`environment=production` -> `api.hashpass.tech` — see the "Native Android App
Environment" section of the root `CLAUDE.md`), **not** to the Play track.
Internal, alpha, and beta all run `environment=development` and all subscribe
to the `"development"` channel; only the `production` track subscribes to
`"production"`. This is deliberate: crossing the two would silently repoint
one environment's installed base at the other environment's JS bundle with no
store review to catch it, which is exactly the failure mode a bad channel
mapping would produce.

Channel <-> branch mapping in `mobile-eas-update.yml`:

| Push to | Channel | Why |
|---|---|---|
| `develop` | `development` | Every `environment=development` binary (internal/alpha/beta) is actually built from a tagged `main` commit, but `runtimeVersion` matching is fingerprint-based (see below), not tied to which ref built it or to the marketing version string. `develop` gets many commits/day, so this is the continuous, "ship in minutes" lane. |
| `main` | `production` | Only fires as often as the protected `develop -> main` promotion PR merges (direct pushes to `main` are rejected), matching the existing deliberately-conservative cadence of the production track itself. |

## runtimeVersion: fingerprint policy, not appVersion (corrected 2026-07-28)

This was originally set to `runtimeVersion: { policy: "appVersion" }`, which
is **wrong** for this repo and was caught before any binary shipped with it.
`appVersion` policy ties OTA matching to the exact marketing version string
(`expo.version`). But `packages/tools/scripts/update-version.mjs` bumps that
string — and `expo.android.versionCode` — on **every single release**,
whether or not anything native changed (see `versioning.config.json`'s
`syncFiles`). Under `appVersion` policy, the very act of cutting a release
changes the runtimeVersion a fresh OTA publish would be tagged with, so it
would stop matching whatever's actually installed on already-shipped
binaries the moment a second release happened — breaking continuous OTA
starting from release #2, every time.

Fixed by switching to `runtimeVersion: { policy: "fingerprint" }` plus
`apps/mobile-app/fingerprint.config.js`:

```js
module.exports = {
  sourceSkips: ['ExpoConfigVersions'], // skip expo.version + expo.android.versionCode
};
```

`fingerprint` policy (backed by `@expo/fingerprint`, already a transitive
dependency of `expo-updates` 0.28.18) computes runtimeVersion as a content
hash over the native-relevant parts of the project — dependencies, app
config, plugins, native project files — instead of the marketing version.
`ExpoConfigVersions` tells it to ignore exactly the two fields that get
auto-bumped every release, so the hash only changes when something
*actually* native-relevant changes. Verified locally against this repo:

- Bumping only `expo.version` + `expo.android.versionCode` → **identical**
  fingerprint hash.
- Adding a new Android permission → **different** hash, as expected.
- Changing an arbitrary `extra.*` value (e.g. `EXPO_PUBLIC_SUPABASE_URL`,
  `extra.eas.projectId`) → no effect either way — `@expo/fingerprint`
  doesn't track the `extra` config section at all, confirmed empirically,
  so environment-specific values baked in via `buildExpoConfig()` never
  cause spurious fingerprint churn between the production and development
  build profiles.

This also confirmed the project's Expo "workflow" resolves to `managed`
(`apps/mobile-app/android/` is gitignored, not committed — see
`resolveWorkflowAsync` in `expo-updates/utils/build/workflow.js`), which
matters because `fingerprint` is the only runtimeVersion policy Expo
supports outside the `managed` workflow — the others throw if the workflow
resolves to `generic` (bare). Confirming `managed` here means we weren't
relying on that fallback; `fingerprint` was simply the correct choice on its
own merits.

## First release after adopting OTA needs one real native build

`v1.8.273` — the version live on Play as of 2026-07-28 — was built and
submitted **before** `expo-updates` existed in this repo. That binary has no
update-checking capability at all; OTA cannot reach it under any
runtimeVersion policy, because the native module that talks to `u.expo.dev`
simply isn't compiled into it. The next release is necessarily the one that
bakes `expo-updates` into the native binary for the first time — there's no
way to retrofit that onto an already-shipped build.

This doesn't need special-casing in the release flow: the native-change
guard (`detect-mobile-native-change.js`) already forces `needsNative: true`
for this exact release, for two independent reasons found in the diff
against `v1.8.273` — `apps/mobile-app/package.json` gained the
`expo-updates` dependency (dependency-diff check), and `apps/mobile-app/app.json`
gained the `runtimeVersion` key (structural diff check, ignoring only the
version/versionCode fields). So the guard sends this release through the
normal full native path (internal → alpha → beta → manual production
dispatch) automatically, exactly as it should.

Once that binary reaches production and real users have updated to it, every
subsequent release that doesn't touch anything native-sensitive publishes
OTA-only (per the guard) and reaches those installed binaries correctly,
because their embedded fingerprint and the fingerprint computed at each
later OTA-publish time stay identical across any number of pure version
bumps — that's the whole point of the fix above.

## How the channel gets embedded without `eas build`

Fastlane builds this app via `expo prebuild` + local Gradle, not `eas build`.
EAS Build normally bakes the channel into the binary for you at build time;
a non-EAS-Build pipeline has to do it explicitly. `buildExpoConfig()` in
`apps/mobile-app/lib/eas-config.js` sets:

```js
updates: {
  url: `https://u.expo.dev/${projectId}`,
  requestHeaders: { 'expo-channel-name': updateChannel },
}
```

`resolveUpdateChannel()` (same file) picks `production` for the `production`
EAS build profile and `development` otherwise, reusing the exact
profile-resolution convention `resolveProjectId`/`resolveExpoToken` already
use. `expo prebuild` writes this into `AndroidManifest.xml`, so it applies
identically whether the build runs via fastlane or `eas build`.
`apps/mobile-app/eas.json`'s `"channel"` field on the `production`/`preview`
build profiles mirrors this for documentation and for the `eas build` path
(`android:release:eas*` scripts) — it does nothing for the fastlane path,
which is why the real enforcement lives in `eas-config.js`, not `eas.json`.

## Publishing

```bash
cd apps/mobile-app
npm run ota:publish       # -> production channel, --auto (uses last commit message)
npm run ota:publish:dev   # -> development channel
```

Both reuse `packages/tools/scripts/run-mobile-eas.js` — the same
`EXPO_TOKEN`/`EXPO_TOKEN_DEV`/`EAS_PROJECT_ID`/`EAS_PROJECT_ID_DEV` secrets
and vars already configured for the `android:release:eas*` backend, no new
credentials needed.

CI: `.github/workflows/mobile-eas-update.yml` runs these automatically on
push (see the path allowlist above), subject to the native-change guard
skipping it if the push also touched something native-sensitive (see
above), and can be dispatched manually with a `channel` override and a
custom `message` — manual dispatch bypasses the guard entirely, trusting the
operator's explicit choice. It runs on a plain `ubuntu-latest` GitHub-hosted
runner — no EC2, no Android SDK, no Ruby/fastlane — since publishing an
update only needs to export the JS bundle, not build native code.

## Rollback

```bash
cd apps/mobile-app
EAS_BUILD_PROFILE=production node ../../packages/tools/scripts/run-mobile-eas.js update:republish --channel production
```

Interactively lists recent updates on that channel and republishes a prior
one instantly — no new build, no store review. Swap
`EAS_BUILD_PROFILE=preview ... --channel development` for the development
channel.

## Known limitation: no self-hosted update server yet

`updates.url` currently points at Expo's hosted `u.expo.dev` service (free up
to 1,000 MAU, usage-priced beyond that). `expo-updates` speaks a documented,
open manifest protocol, so migrating to a self-hosted server later (e.g. on
the same AWS account already used for `api.hashpass.tech`) is a config-only
change — swap `updates.url` in `buildExpoConfig()` — not a client rewrite.
Not needed today; noted here so it isn't re-litigated as a blocker if EAS
Update's usage pricing ever becomes a concern.
