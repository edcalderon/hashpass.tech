import { Platform } from 'react-native';
import { apiClient } from './api-client';
import { compareAppVersions, getRuntimeVersion } from '../config/runtime-version';

const VERSION_STORAGE_KEY = '@hashpass:last_version_check';
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

async function clearAllCaches(): Promise<void> {
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
    if (!forceCheck && isUserActive()) return false;

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
        await clearAllCaches();
        window.location.reload();
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
      if (isUserActive()) {
        setTimeout(() => checkVersionOnStart(), 10 * 60 * 1000);
        return;
      }

      const wasCleared = await checkVersionAndClearCache(true);
      if (wasCleared) return;

      setInterval(() => {
        if (!isUserActive()) {
          checkVersionAndClearCache(false).catch((error) => {
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
