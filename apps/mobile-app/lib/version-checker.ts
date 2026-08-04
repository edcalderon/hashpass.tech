import { Platform } from 'react-native';
import { apiClient } from './api-client';
import { compareAppVersions, getRuntimeVersion } from '../config/runtime-version';

const VERSION_STORAGE_KEY = '@hashpass:last_version_check';
const FORCED_UPDATE_RELOAD_KEY = '@hashpass:forced_update_reload';
const VERSION_CHECK_COOLDOWN = 5 * 60 * 1000;

async function getCurrentVersion(): Promise<string> {
  return getRuntimeVersion();
}

async function fetchLatestVersion(): Promise<{ version: string | null; needsUpdate: boolean }> {
  try {
    const currentVersion = await getCurrentVersion();
    const response = await apiClient.get('/config/versions', {
      skipEventSegment: true,
      skipAuth: true,
      params: { t: Date.now().toString(), clientVersion: currentVersion },
    });

    if (!response.success) {
      console.warn('[VersionChecker] Failed to fetch version:', response.error);
      return { version: null, needsUpdate: false };
    }

    const backendVersion = response.data?.currentVersion || null;
    const versionInfo = response.data?.versionInfo;

    let needsUpdate = false;
    if (versionInfo?.needsUpdate != null) {
      needsUpdate = versionInfo.needsUpdate;
    } else if (backendVersion && currentVersion) {
      needsUpdate = compareAppVersions(currentVersion, backendVersion) < 0;
    }

    return { version: backendVersion, needsUpdate };
  } catch (error) {
    console.error('[VersionChecker] Error fetching version:', error);
    return { version: null, needsUpdate: false };
  }
}

function isUserActive(): boolean {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname;
  const isOnActivePage = pathname.startsWith('/events/') || pathname.startsWith('/dashboard');
  const isPageVisible = typeof document !== 'undefined' && !document.hidden;
  return isOnActivePage && isPageVisible;
}

export function performHardReload(): void {
  if (typeof window === 'undefined') return;

  // Plain window.location.reload() right after clearAllCaches() is not
  // reliable: unregister() only guarantees the service worker stops
  // matching *future* navigations per spec, but browsers vary on whether a
  // reload of the exact same document is re-resolved against that change,
  // so the just-unregistered worker can still serve this one final reload
  // from its own cache-fallback path. Even with no service worker in play,
  // a same-URL reload can still be answered by the browser's own HTTP disk
  // cache or a stale bfcache entry instead of a real network round trip.
  // Navigating to the same URL with a fresh, one-time query param sidesteps
  // all of that: it's a URL no cache layer (service worker, HTTP cache, or
  // any CDN in front) has ever seen, so it forces a genuine fetch.
  const url = new URL(window.location.href);
  url.searchParams.set('_hpv', Date.now().toString());
  window.location.replace(url.toString());
}

export async function clearAllCaches(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch { /* ignore */ }

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  } catch (error) {
    console.error('[VersionChecker] Error clearing caches:', error);
  }
}

export async function checkVersionAndClearCache(forceCheck: boolean = false): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  try {
    // forceCheck no longer means "skip the active-user check" -- see
    // checkVersionOnStart() below, which now always calls this on a timer
    // regardless of activity, and decides forceCheck per-tick based on
    // current activity instead. Gating the check itself on isUserActive()
    // here (as this used to) meant an actively-browsing user (the app's
    // core usage pattern: any /events/ or /dashboard page) never got even
    // the soft 'hashpass:version-update' banner, since every non-forced
    // call from the old caller was silently skipped -- staying stuck on a
    // stale bundle with no way to discover an update exists short of
    // manually hard-refreshing.

    // The cooldown must apply even for forced checks. checkVersionOnStart()
    // calls this with forceCheck=true on every fresh page load (after a
    // 2s delay), and on a needsUpdate=true result it clears caches and
    // calls window.location.reload() — which fully remounts the app and
    // re-runs checkVersionOnStart() from scratch. Skipping the cooldown
    // here meant that loop had zero rate limiting: if the client's
    // baked-in version ever lagged the live backend (e.g. during a string
    // of rapid releases), every reload immediately re-detected the same
    // "update available" condition and reloaded again, forever. localStorage
    // survives reload, so honoring the cooldown here actually breaks the
    // loop after the first reload.
    const lastCheck = localStorage.getItem(VERSION_STORAGE_KEY);
    if (lastCheck && Date.now() - parseInt(lastCheck, 10) < VERSION_CHECK_COOLDOWN) return false;

    localStorage.setItem(VERSION_STORAGE_KEY, Date.now().toString());

    const currentVersion = await getCurrentVersion();
    const { version: latestVersion, needsUpdate } = await fetchLatestVersion();

    if (!latestVersion) return false;

    if (currentVersion !== latestVersion && needsUpdate) {
      console.warn('[VersionChecker] ⚠️ Update available:', latestVersion);
      if (forceCheck) {
        const updateAttempt = `${currentVersion}:${latestVersion}`;
        try {
          // A browser tab keeps sessionStorage through reloads. If a previous
          // cache purge failed to replace the bundle, retrying that exact
          // version pair can only produce another reload loop. Leave the app
          // usable and let the regular update notice handle the next action.
          if (sessionStorage.getItem(FORCED_UPDATE_RELOAD_KEY) === updateAttempt) {
            console.warn('[VersionChecker] Skipping repeated forced update reload:', updateAttempt);
            return false;
          }
        } catch {
          // Storage can be blocked in privacy modes; the existing cooldown is
          // still a safe fallback in that case.
        }

        await clearAllCaches();
        try {
          // clearAllCaches deliberately resets sessionStorage, so persist the
          // marker only after it completes and immediately before reloading.
          sessionStorage.setItem(FORCED_UPDATE_RELOAD_KEY, updateAttempt);
        } catch {
          // See the storage fallback above.
        }
        performHardReload();
        return true;
      }
      window.dispatchEvent(
        new CustomEvent('hashpass:version-update', {
          detail: { currentVersion, latestVersion },
        })
      );
      return true;
    }

    return false;
  } catch (error) {
    console.error('[VersionChecker] Error checking version:', error);
    return false;
  }
}

export async function checkVersionOnStart(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  setTimeout(async () => {
    try {
      // Only take the disruptive path (clear caches + reload) while the user
      // is idle, so an active session is never yanked out from under someone.
      // Previously, being active at this very first check meant the whole
      // function just rescheduled itself and returned -- the setInterval
      // below was never created, so a user who stayed on an /events/ or
      // /dashboard page (this app's core usage pattern) for their entire
      // session never got a version check at all, forced or soft. Now the
      // periodic check is always established regardless of the initial
      // activity state; only which branch (forced reload vs. soft banner)
      // it takes each tick depends on activity at that moment.
      if (!isUserActive()) {
        const wasCleared = await checkVersionAndClearCache(true);
        if (wasCleared) return;
      }

      setInterval(() => {
        if (isUserActive()) {
          // Soft path: just dispatches 'hashpass:version-update' so the
          // update banner can appear, without reloading out from under an
          // active session.
          checkVersionAndClearCache(false).catch((error) => {
            console.warn('[VersionChecker] Periodic check failed:', error);
          });
        } else {
          checkVersionAndClearCache(true).catch((error) => {
            console.warn('[VersionChecker] Periodic check failed:', error);
          });
        }
      }, 10 * 60 * 1000);
    } catch (error) {
      console.error('[VersionChecker] Version check on start failed:', error);
    }
  }, 2000);
}

export async function clearAuthCache(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  try {
    const authKeys = ['@supabase.auth.token', 'sb-', 'supabase.auth.token'];
    authKeys.forEach((key) => {
      try {
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith(key)) localStorage.removeItem(k);
        });
      } catch { /* ignore */ }
    });
    try { sessionStorage.clear(); } catch { /* ignore */ }
  } catch (error) {
    console.error('[VersionChecker] Error clearing auth cache:', error);
  }
}
