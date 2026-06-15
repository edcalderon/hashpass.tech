/**
 * PWA installation detection and utilities
 */

import { Platform } from 'react-native';

type InstalledRelatedApp = {
  platform?: string;
  url?: string;
  id?: string;
};

/**
 * Check if the app is running in standalone mode (installed as PWA)
 * This works for both iOS and Android PWAs
 */
export const isStandalone = (): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  // Check for iOS standalone mode
  if ((window.navigator as any).standalone === true) {
    return true;
  }

  // Check for Android standalone mode using display-mode media query
  if (window.matchMedia) {
    const standaloneMediaQuery = window.matchMedia('(display-mode: standalone)');
    if (standaloneMediaQuery.matches) {
      return true;
    }
  }

  // Check if running in fullscreen mode (another indicator)
  if (window.matchMedia) {
    const fullscreenMediaQuery = window.matchMedia('(display-mode: fullscreen)');
    if (fullscreenMediaQuery.matches) {
      return true;
    }
  }

  // Check if window is not in a browser tab (less reliable but can help)
  // This checks if the app is running in its own window
  if (
    window.matchMedia &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      (document as any).referrer.includes('android-app://'))
  ) {
    return true;
  }

  return false;
};

/**
 * Check if the app can be installed (PWA install prompt available)
 */
export const canInstallPWA = (): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  // Check if beforeinstallprompt event is supported
  // This means the browser supports PWA installation
  return 'serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window;
};

/**
 * Check whether a related web app is already installed on the system.
 * This is supported in Chromium-based browsers and helps distinguish
 * "installed but opened in a browser tab" from a normal installable page.
 */
export const hasInstalledRelatedApp = async (): Promise<boolean> => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  const navigatorWithRelatedApps = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<InstalledRelatedApp[]>;
  };

  if (typeof navigatorWithRelatedApps.getInstalledRelatedApps !== 'function') {
    return false;
  }

  try {
    const relatedApps = await navigatorWithRelatedApps.getInstalledRelatedApps();
    const origin = window.location.origin;

    return relatedApps.some((app) => {
      if (!app) {
        return false;
      }

      if (app.url) {
        return app.url.startsWith(origin) || app.url === '/manifest.json';
      }

      return true;
    });
  } catch (error) {
    console.warn('[PWA Utils] Failed to query installed related apps:', error);
    return false;
  }
};

/**
 * Check if the app is already installed (more reliable check)
 * Combines multiple detection methods
 */
export const isPWAInstalled = (): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  // Primary check: standalone mode (most reliable)
  if (isStandalone()) {
    return true;
  }

  // Secondary check: check if running from home screen
  // iOS Safari specific
  if ((window.navigator as any).standalone === true) {
    return true;
  }

  // Tertiary check: check display mode media query
  if (window.matchMedia) {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    if (displayMode.matches) {
      return true;
    }
    
    // Also check fullscreen mode
    const fullscreenMode = window.matchMedia('(display-mode: fullscreen)');
    if (fullscreenMode.matches) {
      return true;
    }
  }

  // Additional check: Check if window is not in a browser tab
  // When installed, the app runs in its own window context
  if (window.matchMedia) {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    if (standaloneQuery.matches) {
      return true;
    }
  }

  // Check if app was launched from home screen (iOS)
  // This is detected by checking if the app is not in a browser tab
  if ((window.navigator as any).standalone !== undefined) {
    if ((window.navigator as any).standalone === true) {
      return true;
    }
  }

  // Check localStorage for installation flag (set after successful install)
  // This is a fallback method - if flag exists, app was installed at some point.
  try {
    const installFlag = localStorage.getItem('pwa-installed');
    if (installFlag === 'true') {
      console.log('✅ PWA installation detected via localStorage flag');
      return true;
    }
  } catch {
    // localStorage might not be available
  }

  return false;
};

/**
 * Resolve the canonical launch URL from the active web manifest.
 * Falls back to the site root when manifest detection fails.
 */
export const resolvePwaLaunchUrl = (): string => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return '/';
  }

  const fallbackUrl = new URL('/', window.location.origin).toString();

  try {
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const manifestHref = manifestLink?.getAttribute('href');
    if (!manifestHref) {
      return fallbackUrl;
    }

    const manifestUrl = new URL(manifestHref, window.location.origin);
    const manifestDir = manifestUrl.pathname.replace(/[^/]*$/, '') || '/';
    return new URL(manifestDir, manifestUrl.origin).toString();
  } catch {
    console.warn('[PWA Utils] Failed to resolve launch URL');
  }

  return fallbackUrl;
};

/**
 * Build an Android intent URL to encourage handoff to the installed WebAPK/PWA.
 */
export const buildAndroidIntentUrl = (targetUrl: string): string | null => {
  try {
    const parsed = new URL(targetUrl);
    const pathAndQuery = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const scheme = parsed.protocol.replace(':', '');
    const fallback = encodeURIComponent(parsed.toString());
    return `intent://${parsed.host}${pathAndQuery}#Intent;scheme=${scheme};action=android.intent.action.VIEW;S.browser_fallback_url=${fallback};end`;
  } catch (error) {
    console.warn('[PWA Utils] Failed to build Android intent URL:', error);
    return null;
  }
};

/**
 * Get installation status with more details
 */
export const getInstallationStatus = async () => {
  const standalone = isStandalone();
  const relatedAppInstalled = await hasInstalledRelatedApp();
  const installed = standalone || relatedAppInstalled || isPWAInstalled();
  const canInstall = canInstallPWA() && !installed;

  return {
    installed,
    canInstall,
    isStandaloneMode: standalone,
    // Allow reinstall if user wants to update or reinstall
    allowReinstall: true, // Always allow reinstall option
  };
};
