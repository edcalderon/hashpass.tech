import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform } from 'react-native';
import PwaInstallPromptCard from '../../../packages/ui/src/PwaInstallPromptCard';
import { buildAndroidIntentUrl, getInstallationStatus, resolvePwaLaunchUrl } from '../lib/pwa-utils';
import {
  clampPwaDragPosition,
  getDefaultPwaDragPosition,
  PWA_DRAG_START_THRESHOLD,
  readStoredPwaDragPosition,
  storePwaDragPosition,
  type PwaDragPosition,
} from '../lib/pwa-drag';
import { useTranslation } from '../i18n/i18n';

const ANDROID_CHROME_192 = require('../assets/android-chrome-192x192.png');
const ANDROID_CHROME_512 = require('../assets/android-chrome-512x512.png');

const COLLAPSE_KEY = 'hashpass:pwa-install-collapsed';
const DONT_SHOW_AGAIN_KEY = 'hashpass:pwa-dont-show-until-reload';
const DRAG_CLICK_SUPPRESS_MS = 350;

type PwaDragStart = {
  pointerId: number;
  startX: number;
  startY: number;
  originLeft: number;
  originTop: number;
  hasMoved: boolean;
};

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
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [showInstallHelpModal, setShowInstallHelpModal] = useState(false);
  const [dragPosition, setDragPosition] = useState<PwaDragPosition | null>(null);
  const [isDraggingPwa, setIsDraggingPwa] = useState(false);
  const dragStartRef = useRef<PwaDragStart | null>(null);
  const suppressClickAfterDragUntilRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const isDontShowAgain = window.sessionStorage.getItem(DONT_SHOW_AGAIN_KEY) === 'true';
    setDontShowAgain(isDontShowAgain);

    const isStoredCollapsed = window.localStorage.getItem(COLLAPSE_KEY) === 'true';
    setIsCollapsed(isStoredCollapsed);
    setDragPosition(readStoredPwaDragPosition() ?? getDefaultPwaDragPosition());

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
      if (!isStoredCollapsed) {
        setShowPrompt(true);
      }
    };

    void checkStatus();
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);

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

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setDragPosition((currentPosition: PwaDragPosition | null) =>
        clampPwaDragPosition(currentPosition ?? getDefaultPwaDragPosition())
      );
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
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

  const closeInstallHelpModal = () => {
    setShowInstallHelpModal(false);
  };

  const handleDragPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isCollapsed || event.button !== 0) {
      return;
    }

    const currentPosition = dragPosition ?? getDefaultPwaDragPosition();
    dragStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: currentPosition.left,
      originTop: currentPosition.top,
      hasMoved: false,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [dragPosition, isCollapsed]);

  const handleDragPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragStart.startX;
    const deltaY = event.clientY - dragStart.startY;
    const distance = Math.hypot(deltaX, deltaY);
    if (!dragStart.hasMoved && distance < PWA_DRAG_START_THRESHOLD) {
      return;
    }

    dragStart.hasMoved = true;
    setIsDraggingPwa(true);
    event.preventDefault();

    setDragPosition(
      clampPwaDragPosition({
        left: dragStart.originLeft + deltaX,
        top: dragStart.originTop + deltaY,
      })
    );
  }, []);

  const handleDragPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) {
      return;
    }

    if (dragStart.hasMoved) {
      const finalPosition = clampPwaDragPosition({
        left: dragStart.originLeft + event.clientX - dragStart.startX,
        top: dragStart.originTop + event.clientY - dragStart.startY,
      });

      setDragPosition(finalPosition);
      storePwaDragPosition(finalPosition);
      suppressClickAfterDragUntilRef.current = Date.now() + DRAG_CLICK_SUPPRESS_MS;
      window.setTimeout(() => {
        if (Date.now() >= suppressClickAfterDragUntilRef.current) {
          suppressClickAfterDragUntilRef.current = 0;
        }
      }, DRAG_CLICK_SUPPRESS_MS);
    }

    dragStartRef.current = null;
    setIsDraggingPwa(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const handleDragClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() > suppressClickAfterDragUntilRef.current) {
      suppressClickAfterDragUntilRef.current = 0;
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressClickAfterDragUntilRef.current = 0;
  }, []);

  const getInstallInstructions = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return [t('instructions.default', 'To install: use the install icon in your browser address bar.')];
    }

    const userAgent = window.navigator.userAgent;
    if (/Android/i.test(userAgent)) {
      return [
        t('instructions.android', 'To install: open the browser menu and tap "Install app".'),
        t('instructions.default', 'To install: use the install icon in your browser address bar.'),
      ];
    }

    if (/iPhone|iPad|iPod/i.test(userAgent)) {
      return [
        t('instructions.ios', 'To install: tap Share, then "Add to Home Screen".'),
        t('instructions.default', 'To install: use the install icon in your browser address bar.'),
      ];
    }

    return [
      t('instructions.default', 'To install: use the install icon in your browser address bar.'),
    ];
  };

  const installPWA = async () => {
    if (deferredPrompt) {
      try {
        // Show the install prompt
        await deferredPrompt.prompt();

        // Wait for user choice
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
      } catch (error) {
        console.error('[PWAPrompt] Error showing install prompt:', error);
        setDeferredPrompt(null);
      }
    }

    // Fallback: show install modal info card instead of alert
    setShowInstallHelpModal(true);
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

  if (dontShowAgain && !showInstallHelpModal) {
    return null;
  }

  const handleDontShowAgain = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.sessionStorage.setItem(DONT_SHOW_AGAIN_KEY, 'true');
      setDontShowAgain(true);
      setShowPrompt(false);
    }
  };

  const logoSrc = (() => {
    try {
      const resolved = Image.resolveAssetSource(ANDROID_CHROME_192);
      if (resolved && typeof resolved === 'object' && 'uri' in resolved) {
        return resolved.uri;
      }
      return resolved;
    } catch {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        return `${window.location.origin}/favicon.ico`;
      }
      return '/favicon.ico';
    }
  })();

  const primaryIconSrc = (() => {
    try {
      const resolved = Image.resolveAssetSource(ANDROID_CHROME_512);
      if (resolved && typeof resolved === 'object' && 'uri' in resolved) {
        return resolved.uri;
      }
      return resolved;
    } catch {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        return `${window.location.origin}/favicon.ico`;
      }
      return logoSrc;
    }
  })();

  if (showInstallHelpModal) {
    const installInstructions = getInstallInstructions();

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('dialogLabel', 'HASHPASS install prompt')}
        tabIndex={-1}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: 'rgba(2, 6, 23, 0.58)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
        onClick={closeInstallHelpModal}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeInstallHelpModal();
          }
        }}
      >
        <div onClick={(event) => event.stopPropagation()}>
          <PwaInstallPromptCard
            appName="HASHPASS"
            logoSrc={logoSrc}
            logoLayout="icon"
            primaryIconSrc={primaryIconSrc}
            primaryLabel={t('close', 'Close install prompt')}
            title={t('installTitle', 'Install HASHPASS')}
            description={t(
              'installDescription',
              'Install HASHPASS as a PWA to launch it like an app from your home screen.'
            )}
            bodyItems={installInstructions}
            dialogLabel={t('dialogLabel', 'HASHPASS install prompt')}
            closeLabel={t('close', 'Close install prompt')}
            infoLabel={t('whatIsThis', 'What is this?')}
            infoIntro={t('infoIntro', 'A PWA (Progressive Web App) lets HASHPASS behave like a native app on your device.')}
            showInfoToggle={false}
            collapsed={false}
            onPrimaryAction={closeInstallHelpModal}
            onClose={closeInstallHelpModal}
          />
        </div>
      </div>
    );
  }

  if (!showPrompt && !deferredPrompt && !isCollapsed) {
    return null;
  }

  const isOpenAppMode = isInstalled && !isStandaloneMode;
  const collapsedLabel = isOpenAppMode
    ? t('openAction', 'Open HASHPASS App')
    : t('expandCollapsed', 'Open install options');

  const detailsWithCheckbox = !isCollapsed && !isOpenAppMode
    ? [
        t('details.one', 'PWA means Progressive Web App: app-like behavior from your browser install.'),
        t('details.two', 'No app-store download required, but you still get quick home-screen access.'),
        t('details.three', 'Great for event check-in flows, wallets, and notifications with less friction.'),
      ]
    : [
        t('details.one', 'PWA means Progressive Web App: app-like behavior from your browser install.'),
        t('details.two', 'No app-store download required, but you still get quick home-screen access.'),
        t('details.three', 'Great for event check-in flows, wallets, and notifications with less friction.'),
      ];

  const promptCard = (
      <PwaInstallPromptCard
        className={`hp-pwa-floating${isCollapsed ? ' hp-pwa-collapsed-state' : ''}`}
        appName="HASHPASS"
        logoSrc={logoSrc}
        logoLayout="icon"
        primaryIconSrc={primaryIconSrc}
        primaryLabel={isOpenAppMode ? t('openAction', 'Open HASHPASS App') : t('installAction', 'Install HASHPASS')}
        title={isOpenAppMode ? t('openTitle', 'Open your installed app') : t('installTitle', 'Install HASHPASS')}
        description={
          isOpenAppMode
            ? t('openDescription', 'HASHPASS is already installed. Open it in app mode for the best mobile experience.')
            : t('installDescription', 'Install HASHPASS as a PWA to launch it like an app from your home screen.')
        }
        dialogLabel={
          isOpenAppMode
            ? t('openTitle', 'Open your installed app')
            : t('dialogLabel', 'HASHPASS install prompt')
        }
        closeLabel={t('close', 'Close install prompt')}
        infoLabel={t('whatIsThis', 'What is this?')}
        infoIntro={t('infoIntro', 'A PWA (Progressive Web App) lets HASHPASS behave like a native app on your device.')}
        details={detailsWithCheckbox}
        showInfoToggle={!isOpenAppMode}
        collapsed={isCollapsed}
        collapsedLabel={collapsedLabel}
        collapsedActionVariant={isOpenAppMode ? 'open' : 'install'}
        secondaryLabel={!isCollapsed && !isOpenAppMode ? t('dontShowAgain', "Don't show again until reload") : undefined}
        onSecondaryAction={!isCollapsed && !isOpenAppMode ? handleDontShowAgain : undefined}
        onExpand={expandPrompt}
        onPrimaryAction={isOpenAppMode ? openApp : installPWA}
        onClose={collapsePrompt}
      />
  );

  if (isCollapsed) {
    const effectiveDragPosition = dragPosition ?? getDefaultPwaDragPosition();

    return (
      <div
        className={`hp-pwa-wrapper hp-pwa-drag-layer${isDraggingPwa ? ' hp-pwa-dragging' : ''}`}
        style={{
          left: `${Math.round(effectiveDragPosition.left)}px`,
          top: `${Math.round(effectiveDragPosition.top)}px`,
        }}
        onClickCapture={handleDragClickCapture}
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerEnd}
        onPointerCancel={handleDragPointerEnd}
      >
        {promptCard}
      </div>
    );
  }

  return (
    <div className="hp-pwa-wrapper">
      {promptCard}
    </div>
  );
};

export default PWAPrompt;
