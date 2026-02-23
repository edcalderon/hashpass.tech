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

    const checkStatus = () => {
      const status = getInstallationStatus();
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
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
      if (!isStoredCollapsed) {
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

  const installPWA = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === 'accepted') {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.localStorage.setItem('pwa-installed', 'true');
          window.localStorage.removeItem(COLLAPSE_KEY);
        }
        setShowPrompt(false);
        setIsCollapsed(false);
      }

      setDeferredPrompt(null);
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);

      if (isIOS) {
        alert(t('instructions.ios', 'To install: tap Share, then "Add to Home Screen".'));
      } else if (isAndroid) {
        alert(t('instructions.android', 'To install: open the browser menu and tap "Install app".'));
      } else {
        alert(t('instructions.default', 'To install: use the install icon in your browser address bar.'));
      }
    }
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

  return (
    <PwaInstallPromptCard
      className={`hp-pwa-floating${isCollapsed ? ' hp-pwa-collapsed-state' : ''}`}
      appName="HashPass"
      logoSrc={logoSrc}
      logoLayout="icon"
      primaryLabel={isOpenAppMode ? t('openAction', 'Open HashPass App') : t('installAction', 'Install HashPass')}
      title={isOpenAppMode ? t('openTitle', 'Open your installed app') : t('installTitle', 'Install HashPass')}
      description={
        isOpenAppMode
          ? t('openDescription', 'HashPass is already installed. Open it in app mode for the best mobile experience.')
          : t('installDescription', 'Install HashPass as a PWA to launch it like an app from your home screen.')
      }
      dialogLabel={t('dialogLabel', 'HashPass install prompt')}
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
