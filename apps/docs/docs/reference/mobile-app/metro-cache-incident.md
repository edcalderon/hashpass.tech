# Metro Cache Incident (2026-07-26): Stale Bundle Shipped From a Persistent CI Cache

## Summary

The native dashboard hamburger menu (the sidebar/drawer) silently stopped
opening in every real Play-distributed Android build for an unknown
period spanning at least v1.8.262 and v1.8.263 — no crash, no error, no
log line, just a dead tap. It was **not** a code bug: the fix for it had
already shipped in the JS bundle. The self-hosted EC2 release runner's
persistent Metro transform cache (`/home/runner/.metro-cache`) was
serving a stale cached transform for part of the drawer's dependency
chain, and nothing in the release pipeline ever told it that dependency
content had changed. Every local build, every emulator build, and every
`assembleRelease`/`bundleRelease` run outside that one specific,
never-cleared runner directory worked correctly — which is exactly why
this was so hard to find and why it's dangerous as a class of bug.

## Why this was hard to diagnose

Every standard verification method available said the app was fine:

- **Local `assembleRelease`** (debug-signed, real R8 minification): burger worked.
- **`npm run android:play-parity:dev`** (real release keystore, real R8, same `bundleRelease` Gradle task CI uses): burger worked.
- **A real Android 7.1.2 / API 25 / armeabi-v7a device** (Galaxy S3) running a locally-built artifact: burger worked.
- **The actual CI-built artifact** (versionCode 373 / 375, pulled straight off a real device and off the emulator where someone had sideloaded it): burger **did not work**.

The only thing that distinguished the broken artifact from every one of
the working ones was *which machine built it*. Local builds and the
GitHub-hosted parts of CI always start from a clean environment. The
self-hosted EC2 mobile-release runner (`hashpass-mobile-release-i-*`,
instance `i-05628f925bb57e2f1` in `us-east-1`) deliberately does not —
`~/.gradle`, `node_modules`, and `METRO_CACHE_DIR=/home/runner/.metro-cache`
all persist on its EBS volume across every release, by design, to keep
release builds fast. That persistence is exactly what let a stale cache
entry survive silently for weeks.

**If a bug only reproduces on a real device running a real CI-built
artifact, and disappears on every local or emulator rebuild of the same
source, suspect the CI build environment itself — not the code — before
anything else.** This repo has hit "works everywhere except the real
Play build" before (the v1.8.222–224 `newArchEnabled` Play-only outage
was not reproducible locally even via bundletool splits); treat that as
a recurring class of failure specific to this project's split
local/CI/self-hosted-runner build topology, not a one-off.

## Root cause

`.github/workflows/mobile-android-release.yml`'s `Install dependencies`
step (in the `release` job) skips `pnpm install` entirely when a hash of
`pnpm-lock.yaml` + `patches/*/*.patch` matches what was stored from the
previous run, reusing whatever's already in `node_modules`:

```bash
LOCK_HASH=$(sha256sum pnpm-lock.yaml patches/*/*.patch | sha256sum | cut -d' ' -f1)
# ...if $LOCK_HASH matches the stored hash and node_modules exists, skip pnpm install
```

That part is correct and was working as designed. The gap: when the hash
*doesn't* match and `pnpm install` *does* run — as it did for the build
that introduced the swipe-to-close patch to `react-native-drawer-layout`
— pnpm correctly writes the new patched file content into `node_modules`.
Nothing downstream told the **separate** `/home/runner/.metro-cache`
directory that anything had changed. Metro's own internal cache-key
computation for that dependency's transform didn't pick up the change
either, on this runner, for reasons not fully isolated (candidates:
pnpm's content-addressable store hardlinking files with preserved
mtimes into `node_modules`, combined with a Metro cache layer that keys
partly on mtime rather than pure content hash — not confirmed with
certainty, since reproducing it required the actual stale cache state,
which was destroyed as part of the fix). What *is* confirmed: the
shipped release bundle's app-level JS (`dashboard-drawer.ts`,
`dashboard/_layout.tsx`) was fresh and correct — verified with `strings`
against the real bundle extracted from a live device's installed APK —
while the actual on-device behavior was still broken, isolating the
staleness to something in the dependency layer Metro transforms, not the
app source Metro also transforms fresh every time.

The cache itself had not been cleared since at least **2026-07-03**
(`du -sh /home/runner/.metro-cache` → 408MB, oldest cache entries
predating that date) — spanning every release in between, including
every prior attempt to fix this exact drawer/sidebar behavior
(v1.8.219 through v1.8.262).

## Diagnosis path (for the next time something like this happens)

1. Reproduced the failure on the actual shipped artifact, not a local
   rebuild — pulled the real `base.apk` off a device that had the real
   CI build installed (`adb shell pm path` → `adb pull`), extracted
   `assets/index.android.bundle` (Hermes bytecode), and confirmed via
   `strings -n 6` that the fixed JS source strings were present. This
   ruled out "the fix never shipped" and pointed at something below the
   app-source layer.
2. Compared a different, unrelated interactive element (the
   notifications bell) on the *same broken build* — it worked perfectly,
   which ruled out a blanket touch/render/JS-execution failure and
   narrowed the bug to something specific to the drawer's code path.
3. `uiautomator dump` before and after tapping the burger, diffed
   node-by-node — confirmed **zero** new UI nodes appeared (not a
   stuck-off-screen render, not an animation-only failure: nothing
   mounted at all).
4. Pulled the actual CI job logs (`gh api .../actions/jobs/<id>/logs`,
   not `gh run view --log`, which returned empty for this self-hosted-
   runner job) and found `METRO_CACHE_DIR: /home/runner/.metro-cache` —
   a path that only makes sense as a *persistent* cache on a
   self-hosted runner.
5. Started the (normally auto-stopped) runner instance via `aws ssm`
   (profile `hashpass`, region `us-east-1`, instance
   `i-05628f925bb57e2f1`), inspected the cache directory's age and size
   directly, and cleared it as a live test — then dispatched a **retry**
   release for the already-tagged version (the sanctioned manual-
   dispatch case per this repo's release rules — see "Mobile Android
   Release Workflow" in the root `CLAUDE.md`) to confirm the fix.

## The fix

`.github/workflows/mobile-android-release.yml`'s `release` job now:

- Clears `$METRO_CACHE_DIR` automatically whenever the `Install
  dependencies` step actually ran `pnpm install` (i.e. whenever
  `pnpm-lock.yaml`/`patches/*/*.patch` changed) — tying Metro cache
  invalidation to the exact same signal that already governs
  `node_modules` reinstallation, so the two can never drift apart again
  the way they did here.
- Also accepts a manual `clear_metro_cache` workflow-dispatch boolean
  input, for the case where staleness is suspected but the dependency
  hash didn't change (the escape hatch this incident didn't have).
- Logs every clear — timestamp, git ref, reason, cache size and age
  before deletion, triggering run ID — to a persistent audit file on the
  runner itself (`~/.metro-cache-clear-log`), so cache history is
  inspectable across builds instead of scattered across CI log
  retention windows.

## Manual cache inspection / clear (fallback, if the workflow step ever needs bypassing)

Requires the `hashpass` AWS CLI profile (see "Target AWS Account Access"
in the root `CLAUDE.md`) and instance `i-05628f925bb57e2f1`:

```bash
export AWS_PROFILE=hashpass
export AWS_REGION=us-east-1

# The runner auto-stops between releases — start it first
aws ec2 start-instances --instance-ids i-05628f925bb57e2f1
aws ec2 wait instance-running --instance-ids i-05628f925bb57e2f1
# then poll `aws ssm describe-instance-information` for PingStatus=Online

# Inspect before clearing
aws ssm send-command --instance-ids i-05628f925bb57e2f1 \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["du -sh /home/runner/.metro-cache","cat /home/runner/.metro-cache-clear-log 2>/dev/null | tail -20"]'

# Clear
aws ssm send-command --instance-ids i-05628f925bb57e2f1 \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["rm -rf /home/runner/.metro-cache","mkdir -p /home/runner/.metro-cache","chown runner:runner /home/runner/.metro-cache"]'

# Fetch the command's output with `aws ssm get-command-invocation --command-id <id> --instance-id i-05628f925bb57e2f1`
```

Prefer the `clear_metro_cache` workflow-dispatch input over this manual
path when possible — it logs to the audit file automatically and
doesn't require a human to remember to stop the instance afterward
(the workflow's own `stop-runner` job handles that).
