import React, { useEffect, useState } from 'react';
import { Image, Platform } from 'react-native';
import { PwaInstallPromptCard } from '@hashpass/ui';
import { buildAndroidIntentUrl, getInstallationStatus, resolvePwaLaunchUrl } from '../lib/pwa-utils';
import { useTranslation } from '../i18n/i18n';

const COLLAPSE_KEY = 'hashpass:pwa-install-collapsed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

const PWAPrompt = () => {
  const { t } = useTranslation('pwaPrompt');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const isStoredCollapsed = window.localStorage.getItem(COLLAPSE_KEY) === 'true';
    setIsCollapsed(isStoredCollapsed);

    let cancelled = false;

    const checkStatus = async () => {
      const status = await getInstallationStatus();
      if (cancelled) {
        return;
      }

      setIsInstalled(status.installed);
      setIsStandaloneMode(status.isStandaloneMode);

      const shouldShowInstall = !status.installed && status.canInstall;
      const shouldShowOpenApp = status.installed && !status.isStandaloneMode;
      setShowPrompt(shouldShowInstall || shouldShowOpenApp);

      if (status.installed && status.isStandaloneMode) {
        window.localStorage.removeItem(COLLAPSE_KEY);
        setIsCollapsed(false);
      }
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      // Prevent the mini-infobar from appearing on mobile
      installEvent.preventDefault();
      // Capture the event for later use
      setDeferredPrompt(installEvent);
      console.log('[PWAPrompt] beforeinstallprompt event captured');
      if (!isStoredCollapsed) {
        setShowPrompt(true);
      }
    };

    void checkStatus();
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);

    // Log when we're ready to listen for install prompt
    console.log('[PWAPrompt] Listening for beforeinstallprompt event');

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void checkStatus();
      }
    };

    const handleFocus = () => {
      void checkStatus();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const interval = window.setInterval(() => {
      void checkStatus();
    }, 4000);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, []);

  const collapsePrompt = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(COLLAPSE_KEY, 'true');
    }
    setIsCollapsed(true);
    setShowPrompt(false);
  };

  const expandPrompt = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.removeItem(COLLAPSE_KEY);
    }
    setIsCollapsed(false);
    setShowPrompt(true);
  };

  const showInstallFallbackAlert = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const userAgent = window.navigator.userAgent;
    const installInstruction = /Android/i.test(userAgent)
      ? t('instructions.android', 'To install: open the browser menu and tap "Install app".')
      : /iPhone|iPad|iPod/i.test(userAgent)
        ? t('instructions.ios', 'To install: tap Share, then "Add to Home Screen".')
        : t('instructions.default', 'To install: use the install icon in your browser address bar.');

    window.alert(
      [
        t('installTitle', 'Install HashPass'),
        t('installDescription', 'Install HashPass as a PWA to launch it like an app from your home screen.'),
        installInstruction,
      ].join('\n\n')
    );
  };

  const installPWA = async () => {
    console.log('[PWAPrompt] Install clicked, deferredPrompt:', !!deferredPrompt);

    if (deferredPrompt) {
      try {
        console.log('[PWAPrompt] Showing native install prompt...');
        // Show the install prompt
        await deferredPrompt.prompt();

        // Wait for user choice
        const choiceResult = await deferredPrompt.userChoice;
        console.log('[PWAPrompt] User choice:', choiceResult.outcome);

        if (choiceResult.outcome === 'accepted') {
          console.log('[PWAPrompt] Installation accepted');
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.localStorage.setItem('pwa-installed', 'true');
            window.localStorage.removeItem(COLLAPSE_KEY);
          }
          setShowPrompt(false);
          setIsCollapsed(false);
        } else {
          console.log('[PWAPrompt] Installation dismissed');
        }

        setDeferredPrompt(null);
        return;
      } catch (error) {
        console.error('[PWAPrompt] Error showing install prompt:', error);
        setDeferredPrompt(null);
      }
    }

    // Fallback: show install modal info card instead of alert
    console.log('[PWAPrompt] Native prompt not available, showing installation instructions');
    showInstallFallbackAlert();
    setShowPrompt(true);
  };

  const openApp = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const startUrl = resolvePwaLaunchUrl();
      const targetUrl = new URL(startUrl);
      targetUrl.searchParams.set('source', 'pwa_open_button');
      const targetHref = targetUrl.toString();

      const isAndroid = /Android/i.test(window.navigator.userAgent);
      if (isAndroid) {
        const intentUrl = buildAndroidIntentUrl(targetHref);
        if (intentUrl) {
          window.location.assign(intentUrl);
          return;
        }
      }

      const openedWindow = window.open(targetHref, '_blank', 'noopener,noreferrer');
      if (!openedWindow) {
        window.location.assign(targetHref);
      }
    }
  };

  if (Platform.OS !== 'web') {
    return null;
  }

  if (isInstalled && isStandaloneMode) {
    return null;
  }

  if (!showPrompt && !deferredPrompt && !isCollapsed) {
    return null;
  }

  const isOpenAppMode = isInstalled && !isStandaloneMode;
  const logoSrc = (() => {
    try {
      return Image.resolveAssetSource(require('../assets/android-chrome-192x192.png')).uri;
    } catch {
      return '/favicon.ico';
    }
  })();

  const primaryIconSrc = (() => {
    try {
      return Image.resolveAssetSource(require('../assets/android-chrome-512x512.png')).uri;
    } catch {
      return logoSrc;
    }
  })();

  return (
    <PwaInstallPromptCard
      className={`hp-pwa-floating${isCollapsed ? ' hp-pwa-collapsed-state' : ''}`}
      appName="HashPass"
      logoSrc={logoSrc}
      logoLayout="icon"
      primaryIconSrc={primaryIconSrc}
      primaryLabel={isOpenAppMode ? t('openAction', 'Open HashPass App') : t('installAction', 'Install HashPass')}
      title={isOpenAppMode ? t('openTitle', 'Open your installed app') : t('installTitle', 'Install HashPass')}
      description={
        isOpenAppMode
          ? t('openDescription', 'HashPass is already installed. Open it in app mode for the best mobile experience.')
          : t('installDescription', 'Install HashPass as a PWA to launch it like an app from your home screen.')
      }
      dialogLabel={
        isOpenAppMode
          ? t('openTitle', 'Open your installed app')
          : t('dialogLabel', 'HashPass install prompt')
      }
      closeLabel={t('close', 'Close install prompt')}
      infoLabel={t('whatIsThis', 'What is this?')}
      infoIntro={t('infoIntro', 'A PWA (Progressive Web App) lets HashPass behave like a native app on your device.')}
      details={[
        t('details.one', 'PWA means Progressive Web App: app-like behavior from your browser install.'),
        t('details.two', 'No app-store download required, but you still get quick home-screen access.'),
        t('details.three', 'Great for event check-in flows, wallets, and notifications with less friction.'),
      ]}
      showInfoToggle={!isOpenAppMode}
      collapsed={isCollapsed}
      collapsedLabel={t('expandCollapsed', 'Open install options')}
      onExpand={expandPrompt}
      onPrimaryAction={isOpenAppMode ? openApp : installPWA}
      onClose={collapsePrompt}
    />
  );
};

export default PWAPrompt;
