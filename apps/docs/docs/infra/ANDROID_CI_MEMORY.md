# Android CI Memory Budget

> **Last updated:** v1.8.132 (2026-06-24)
> **EC2 instance:** t3a.large — 7842 MiB usable RAM

## Current Safe Allocation

During `bundleRelease`, the Gradle JVM and the Metro bundler (Node.js subprocess) run **concurrently**. Both need bounded heap or the EC2 instance OOMs.

| Process | Heap cap | Where it is set |
|---------|----------|-----------------|
| Node.js / Metro bundler | `--max-old-space-size=3072` (3 GiB) | `NODE_OPTIONS` in the job-level `env:` block of `mobile-android-release.yml` |
| Gradle JVM | `-Xmx2048m` (2 GiB) | `GRADLE_MB=2048` in the "Tune build memory limits" step |
| Gradle Metaspace | `-XX:MaxMetaspaceSize=512m` | "Configure Gradle" step (`gradle.properties`) |
| **Peak total** | **5632 MiB** | leaves ~2.2 GiB for OS + runner process |

## Why This Split

Metro does all the heavy JS bundling. The app has hundreds of API route files — peak heap during a full bundle is > 2 GiB. Gradle itself only orchestrates (spawns Metro for JS, CMake for native), so 2 GiB is plenty for the Gradle daemon.

**`NODE_OPTIONS` cannot be set via `$GITHUB_ENV`.** GitHub Actions blocks it for security. It must live in the job-level `env:` block; a step cannot override it at runtime.

## Failure History

| Version | Symptom | Root cause | Fix applied |
|---------|---------|-----------|-------------|
| ≤ v1.8.125 | Build canceled mid-run: "runner has received a shutdown signal" | `stop-runner` called `/repos/.../actions/runners` (requires `manage_runners:org` — GITHUB_TOKEN in org repos returns 403). Error JSON was concat'd with the `\|\| echo 0` fallback → `BUSY=<json>0` (non-integer). Bash `-gt` comparison errored silently → treated as "not busy" → EC2 stopped while next build was mid-Gradle | Switched to workflow runs API (`/actions/runs`), accessible with `actions: read`. Added safe default: skip stop on any non-integer response |
| v1.8.129 | SIGTERM after ~7 s of Gradle ("The operation was canceled") | Same stop-runner 403 bug — one run's stop-runner killed the next queued run's Gradle after EC2 shutdown propagated SIGTERM | Same fix as above |
| v1.8.129 (earlier attempt) | SIGTERM from OS OOM killer | `NODE_OPTIONS=3584m` + Gradle `4096m` = 7680 MiB; left no room for OS → kernel killed Gradle with SIGTERM | Reduced both values |
| v1.8.131 | `FATAL ERROR: JavaScript heap out of memory` at 2036/2048 MiB | Over-correction left Node at only 2048m while Gradle got 3072m; Metro peaked above 2 GiB during bundle | Swap: Node=3072m, Gradle=2048m (same 5632 MiB total) |

## Diagnosing Future Failures

**Metro OOM** — look for this in Gradle task output:
```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
> Task :app:createBundleReleaseJsAndAssets FAILED
```
Fix: raise `NODE_OPTIONS`, lower `GRADLE_MB` by the same amount.

**Gradle OOM** — look for a heap dump file in `apps/mobile-app/android/` and this in logs:
```
java.lang.OutOfMemoryError: Java heap space
```
Fix: raise `GRADLE_MB`, lower `NODE_OPTIONS` by the same amount.

**SIGTERM / "runner has received a shutdown signal"** — the EC2 instance was stopped while a build was running. Check the stop-runner step log for a 403 error on `gh api`. The current fix uses the workflow runs API; if that also returns an error, the script defaults to `exit 0` (skip stop, rely on the 600 s idle watchdog instead).

## Scaling Up

If bundles keep growing and 3072m is no longer enough for Metro, upgrade to **t3a.xlarge (16 GiB)** and update the threshold in "Tune build memory limits":

```yaml
# Current (8 GiB):
if [ "$TOTAL_MB" -le 9216 ]; then
  GRADLE_MB=2048
  GRADLE_WORKERS=2

# After upgrade to t3a.xlarge (16 GiB):
if [ "$TOTAL_MB" -le 9216 ]; then
  GRADLE_MB=2048
  GRADLE_WORKERS=2
elif [ "$TOTAL_MB" -le 18432 ]; then
  GRADLE_MB=4096
  GRADLE_WORKERS=4
```

And update `NODE_OPTIONS` to `--max-old-space-size=6144` in the job-level `env:` block. Keep the combined peak under 80 % of total RAM.

## Key Files

- `.github/workflows/mobile-android-release.yml` — `NODE_OPTIONS` (job `env:` block), "Tune build memory limits" step, "Configure Gradle" step
- `apps/mobile-app/metro.config.js` — Metro cache dir (`METRO_CACHE_DIR` env)
