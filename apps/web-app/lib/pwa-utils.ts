/**
 * PWA installation detection and utilities
 */

import { Platform } from 'react-native';

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
  // This is a fallback method - if flag exists, app was installed at some point
  // Trust this flag even if not in standalone mode (user might be viewing in browser tab)
  try {
    const installFlag = localStorage.getItem('pwa-installed');
    if (installFlag === 'true') {
      console.log('✅ PWA installation detected via localStorage flag');
      // If flag exists, app is installed - trust this even if not in standalone mode
      return true;
    }
  } catch (e) {
    // localStorage might not be available
  }

  // Additional check: If we're in a PWA context but not detected by other methods
  // Check if service worker is active (indicates PWA setup)
  if ('serviceWorker' in navigator) {
    try {
      // Check if there's an active service worker registration
      const registration = navigator.serviceWorker.controller;
      if (registration) {
        // Service worker is controlling the page - likely a PWA
        // But this alone isn't definitive, so we'll use it as a hint
        // Combined with localStorage flag, this is more reliable
      }
    } catch (e) {
      // Service worker check failed
    }
  }

  return false;
};

/**
 * Get installation status with more details
 */
export const getInstallationStatus = () => {
  const installed = isPWAInstalled();
  const canInstall = canInstallPWA();
  const isStandaloneMode = isStandalone();

  return {
    installed,
    canInstall,
    isStandaloneMode,
    // Allow reinstall if user wants to update or reinstall
    allowReinstall: true, // Always allow reinstall option
  };
};

