/**
 * Version Checker Utility
 * Checks app version against API and clears cache if mismatch detected
 */

import { Platform } from 'react-native';
import { apiClient } from './api-client';
const VERSION_STORAGE_KEY = '@hashpass:last_version_check';
const VERSION_CHECK_COOLDOWN = 5 * 60 * 1000; // 5 minutes cooldown (increased from 1 minute)

interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  isMatch: boolean;
  needsUpdate: boolean;
}

/**
 * Get current app version from package.json or config
 * Uses fetch to avoid module resolution issues
 */
async function getCurrentVersion(): Promise<string> {
  // On web, fetch version from API endpoint to avoid module resolution issues
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Try to get from window.__APP_VERSION__ if set during build
    if ((window as any).__APP_VERSION__) {
      return (window as any).__APP_VERSION__;
    }
    
    // Try to fetch from API endpoint (safer than importing modules)
    try {
      const timestamp = Date.now();
      const response = await apiClient.get('/config/versions', {
        skipEventSegment: true,
        params: { t: timestamp.toString() },
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        }
      });
      if (response.success && response.data?.currentVersion) {
        return response.data.currentVersion;
      }
    } catch (e) {
      // Ignore fetch errors - will use fallback
    }
  }
  
  // Hardcoded fallback - avoids any module resolution
  return '1.6.28';
}

/**
 * Fetch latest version from API (always fresh, no cache)
 * Returns version info including comparison data
 */
async function fetchLatestVersion(): Promise<{ version: string | null; needsUpdate: boolean }> {
  try {
    const timestamp = Date.now();
    const currentVersion = await getCurrentVersion();
    
    const response = await apiClient.get('/config/versions', {
      skipEventSegment: true,
      params: { 
        t: timestamp.toString(),
        clientVersion: currentVersion, // Send client version to backend
      },
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Client-Version': currentVersion, // Also send in header
      }
    });

    if (!response.success) {
      console.warn('[VersionChecker] Failed to fetch version:', response.error);
      return { version: null, needsUpdate: false };
    }

    const backendVersion = response.data?.currentVersion || null;
    const versionInfo = response.data?.versionInfo;
    
    // Use versionInfo.needsUpdate if available, otherwise compare manually
    let needsUpdate = false;
    if (versionInfo?.needsUpdate !== null && versionInfo?.needsUpdate !== undefined) {
      needsUpdate = versionInfo.needsUpdate;
    } else if (backendVersion && currentVersion) {
      // Manual comparison if versionInfo not available
      needsUpdate = compareVersions(currentVersion, backendVersion) < 0;
    }

    return { version: backendVersion, needsUpdate };
  } catch (error) {
    console.error('[VersionChecker] Error fetching version:', error);
    return { version: null, needsUpdate: false };
  }
}

/**
 * Compare two semantic versions
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  const maxLength = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    
    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }
  
  return 0;
}

/**
 * Check if user is actively using the app (not idle)
 * Prevents version checks from interrupting active sessions
 */
function isUserActive(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check if we're on a networking or active page
  const pathname = window.location.pathname;
  const activePages = [
    '/events/bsl2025/networking',
    '/events/bsl2025/my-bookings',
    '/events/bsl2025/agenda',
    '/dashboard',
  ];
  
  const isOnActivePage = activePages.some(page => pathname.includes(page));
  
  // Also check if page is visible (not in background tab)
  const isPageVisible = typeof document !== 'undefined' && !document.hidden;
  
  return isOnActivePage && isPageVisible;
}

/**
 * Clear all caches (Service Worker and browser caches)
 */
async function clearAllCaches(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  try {
    // Clear Service Worker caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[VersionChecker] Clearing cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }

    // Clear browser caches (localStorage, sessionStorage)
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn('[VersionChecker] Failed to clear storage:', e);
    }

    // Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => {
          console.log('[VersionChecker] Unregistering service worker');
          return registration.unregister();
        })
      );
    }

    console.log('[VersionChecker] ✅ All caches cleared');
  } catch (error) {
    console.error('[VersionChecker] Error clearing caches:', error);
  }
}

/**
 * Check version and clear cache if mismatch
 * Returns true if cache was cleared
 */
export async function checkVersionAndClearCache(forceCheck: boolean = false): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  try {
    // Don't check if user is actively using the app
    if (!forceCheck && isUserActive()) {
      console.log('[VersionChecker] User is active, skipping version check');
      return false;
    }
    
    // Check cooldown
    if (!forceCheck) {
      const lastCheck = localStorage.getItem(VERSION_STORAGE_KEY);
      if (lastCheck) {
        const lastCheckTime = parseInt(lastCheck, 10);
        const now = Date.now();
        if (now - lastCheckTime < VERSION_CHECK_COOLDOWN) {
          console.log('[VersionChecker] Version check cooldown active');
          return false;
        }
      }
    }

    // Update last check time
    localStorage.setItem(VERSION_STORAGE_KEY, Date.now().toString());

    const currentVersion = await getCurrentVersion();
    const { version: latestVersion, needsUpdate } = await fetchLatestVersion();

    if (!latestVersion) {
      console.warn('[VersionChecker] Could not fetch latest version');
      return false;
    }

    console.log('[VersionChecker] Current:', currentVersion, 'Backend:', latestVersion);

    // Only clear cache and reload if backend is newer (needsUpdate = true)
    // If frontend is newer, that's OK - don't reload
    if (currentVersion !== latestVersion) {
      if (needsUpdate) {
        // Backend is newer - frontend should update
        console.warn('[VersionChecker] ⚠️ Backend is newer! Clearing cache and reloading...');
        await clearAllCaches();
        
        // Reload page after cache clear
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }, 1000);
        
        return true;
      } else {
        // Frontend is newer - this is OK, no action needed
        console.log('[VersionChecker] ℹ️ Frontend is newer than backend - this is OK, continuing...');
        return false;
      }
    }

    console.log('[VersionChecker] ✅ Version check passed');
    return false;
  } catch (error) {
    console.error('[VersionChecker] Error checking version:', error);
    return false;
  }
}

/**
 * Check version on app start (first load)
 */
export async function checkVersionOnStart(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  // Use setTimeout to defer version check and avoid blocking initial render
  // This prevents path resolution issues during module loading
  setTimeout(async () => {
    try {
      // Don't check if user is actively using networking or other features
      if (isUserActive()) {
        console.log('[VersionChecker] User is active, deferring version check');
        // Defer check until user is idle
        setTimeout(() => checkVersionOnStart(), 10 * 60 * 1000); // Retry in 10 minutes
        return;
      }
      
      // Check immediately on first load
      const wasCleared = await checkVersionAndClearCache(true);
      
      if (wasCleared) {
        // Cache was cleared, page will reload
        return;
      }

      // Also check periodically, but only when user is not active
      setInterval(() => {
        // Skip check if user is actively using the app
        if (isUserActive()) {
          console.log('[VersionChecker] User is active, skipping periodic check');
          return;
        }
        
        checkVersionAndClearCache(false).catch((error) => {
          console.warn('[VersionChecker] Periodic check failed:', error);
        });
      }, 10 * 60 * 1000); // Every 10 minutes (increased from 5)
    } catch (error) {
      console.error('[VersionChecker] Version check on start failed:', error);
    }
  }, 2000); // Increased delay to 2 seconds to let app fully initialize
}

/**
 * Clear auth-related caches (for fixing auth flow issues)
 */
export async function clearAuthCache(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  try {
    // Clear auth-related localStorage items
    const authKeys = [
      '@supabase.auth.token',
      'sb-',
      'supabase.auth.token',
    ];

    authKeys.forEach((key) => {
      try {
        // Clear all keys that start with the prefix
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith(key)) {
            localStorage.removeItem(k);
          }
        });
      } catch (e) {
        // Ignore errors
      }
    });

    // Clear sessionStorage
    try {
      sessionStorage.clear();
    } catch (e) {
      // Ignore errors
    }

    console.log('[VersionChecker] ✅ Auth cache cleared');
  } catch (error) {
    console.error('[VersionChecker] Error clearing auth cache:', error);
  }
}

