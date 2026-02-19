/**
 * Hook for PWA installation status and management
 */

import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { getInstallationStatus, isPWAInstalled, canInstallPWA } from '../lib/pwa-utils';

export interface PWAInstallStatus {
  installed: boolean;
  canInstall: boolean;
  isStandaloneMode: boolean;
  allowReinstall: boolean;
}

export const usePWAInstall = () => {
  const [status, setStatus] = useState<PWAInstallStatus>({
    installed: false,
    canInstall: false,
    isStandaloneMode: false,
    allowReinstall: true,
  });

  useEffect(() => {
    const updateStatus = () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const installStatus = getInstallationStatus();
        setStatus(installStatus);
      }
    };

    // Initial check
    updateStatus();

    // Listen for changes (e.g., when app is installed)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Check on visibility change (user might have installed app)
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          updateStatus();
        }
      };

      // Check on focus (user might have installed app in another tab)
      const handleFocus = () => {
        updateStatus();
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleFocus);

      // Periodic check (every 5 seconds) to catch installation
      const interval = setInterval(updateStatus, 5000);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
        clearInterval(interval);
      };
    }
  }, []);

  return status;
};

