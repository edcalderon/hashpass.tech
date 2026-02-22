import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useColorScheme } from 'nativewind';
import { PwaInstallPromptCard } from '@hashpass/ui';
import { getInstallationStatus } from '../lib/pwa-utils';

const DISMISS_KEY = 'hashpass:pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

const PWAPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const { colorScheme } = useColorScheme();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const isStoredDismissed = window.localStorage.getItem(DISMISS_KEY) === 'true';
    setIsDismissed(isStoredDismissed);

    const checkStatus = () => {
      const status = getInstallationStatus();
      setIsInstalled(status.installed);
      setIsStandaloneMode(status.isStandaloneMode);

      const shouldShowInstall = !status.installed && status.canInstall;
      const shouldShowOpenApp = status.installed && !status.isStandaloneMode;
      setShowPrompt((shouldShowInstall || shouldShowOpenApp) && !isStoredDismissed);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
      if (!isStoredDismissed) {
        setShowPrompt(true);
      }
    };

    checkStatus();
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkStatus();
      }
    };

    window.addEventListener('focus', checkStatus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const interval = window.setInterval(checkStatus, 4000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('focus', checkStatus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, []);

  const dismissPrompt = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, 'true');
    }
    setIsDismissed(true);
    setShowPrompt(false);
  };

  const installPWA = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === 'accepted') {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.localStorage.setItem('pwa-installed', 'true');
        }
        setShowPrompt(false);
      }

      setDeferredPrompt(null);
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);

      if (isIOS) {
        alert('To install: tap Share, then "Add to Home Screen".');
      } else if (isAndroid) {
        alert('To install: open the browser menu and tap "Install app".');
      } else {
        alert('To install: use the install icon in your browser address bar.');
      }
    }
  };

  const openApp = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = window.location.origin + window.location.pathname;
    }
  };

  if (Platform.OS !== 'web') {
    return null;
  }

  if (isInstalled && isStandaloneMode) {
    return null;
  }

  if (!showPrompt && !deferredPrompt) {
    return null;
  }

  if (isDismissed) {
    return null;
  }

  const isOpenAppMode = isInstalled && !isStandaloneMode;
  const logoSrc =
    colorScheme === 'dark'
      ? '/assets/logos/hashpass/logo-full-hashpass-white.svg'
      : '/assets/logos/hashpass/logo-full-hashpass-black.svg';

  return (
    <PwaInstallPromptCard
      className="hp-pwa-floating"
      appName="HashPass"
      logoSrc={logoSrc}
      primaryLabel={isOpenAppMode ? 'Open HashPass App' : 'Install HashPass'}
      title={isOpenAppMode ? 'Open your installed app' : 'Install HashPass'}
      description={
        isOpenAppMode
          ? 'HashPass is already installed. Open it in app mode for the best mobile experience.'
          : 'Install HashPass as a PWA to launch it like an app from your home screen.'
      }
      details={[
        'PWA means Progressive Web App: app-like behavior from your browser install.',
        'No app-store download required, but you still get quick home-screen access.',
        'Great for event check-in flows, wallets, and notifications with less friction.',
      ]}
      showInfoToggle={!isOpenAppMode}
      onPrimaryAction={isOpenAppMode ? openApp : installPWA}
      onClose={dismissPrompt}
    />
  );
};

export default PWAPrompt;
