import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform } from 'react-native';
import PwaInstallPromptCard from '../../../packages/ui/src/PwaInstallPromptCard';
import {
  buildAndroidIntentUrl,
  getInstallationStatus,
  resolvePwaLaunchUrl,
  resolvePwaPromptVisibility,
} from '../lib/pwa-utils';
import {
  clampPwaDragPosition,
  getDefaultPwaDragPosition,
  getPwaDragViewport,
  PWA_DRAG_START_THRESHOLD,
  readStoredPwaDragPosition,
  storePwaDragPosition,
  type PwaDragPosition,
  type PwaDragViewport,
} from '../lib/pwa-drag';
import { getPwaInstallInstructionKeys } from '../lib/pwa-install';
import { useTranslation } from '../i18n/i18n';

const ANDROID_CHROME_192 = require('../assets/android-chrome-192x192.webp');
const ANDROID_CHROME_512 = require('../assets/android-chrome-512x512.webp');

const COLLAPSE_KEY = 'hashpass:pwa-install-collapsed';
const DONT_SHOW_AGAIN_KEY = 'hashpass:pwa-dont-show-until-reload';
const ANDROID_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.hashpass.tech';

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
  const [dockViewport, setDockViewport] = useState<PwaDragViewport>(() => getPwaDragViewport());
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; position: PwaDragPosition; moved: boolean } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const isDontShowAgain = window.sessionStorage.getItem(DONT_SHOW_AGAIN_KEY) === 'true';
    setDontShowAgain(isDontShowAgain);

    // No stored preference (COLLAPSE_KEY unset) means this is a first-ever
    // visit -- default to collapsed rather than auto-expanding the full
    // install card, which used to pop up immediately and overlap the cookie
    // consent banner (both show on first visit). Users can still expand it
    // themselves via the small floating button.
    const storedCollapseValue = window.localStorage.getItem(COLLAPSE_KEY);
    const isStoredCollapsed = storedCollapseValue === null ? true : storedCollapseValue === 'true';
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

      setShowPrompt((wasVisible) =>
        resolvePwaPromptVisibility({
          wasVisible,
          installed: status.installed,
          isStandaloneMode: status.isStandaloneMode,
          canInstall: status.canInstall,
        })
      );

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
      // The browser toolbar and pinch-zoom viewport can change independently
      // of the layout viewport. Keep the chosen coordinate, but clamp it to
      // the freshly reachable rectangle.
      const nextViewport = getPwaDragViewport();
      setDockViewport(nextViewport);
      setDragPosition((currentPosition) =>
        clampPwaDragPosition(currentPosition ?? getDefaultPwaDragPosition(nextViewport), nextViewport)
      );
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
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
    collapsePrompt();
  };

  const getInstallInstructions = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return [t('instructions.default', 'To install: use the install icon in your browser address bar.')];
    }

    const instructionFallbacks: Record<string, string> = {
      'instructions.safariIos': 'In Safari: tap Share, then Add to Home Screen and Add.',
      'instructions.chromeIos': 'In Chrome on iPhone: open the Share menu, then choose Add to Home Screen.',
      'instructions.firefoxIos': 'In Firefox on iPhone: use the Share menu and choose Add to Home Screen.',
      'instructions.chromeAndroid': 'In Chrome: open the three-dot menu, then tap Install app.',
      'instructions.firefoxAndroid': 'In Firefox: open the three-dot menu, then tap Install.',
      'instructions.default': 'To install: use the install icon in your browser address bar.',
    };

    return getPwaInstallInstructionKeys(window.navigator.userAgent).map((key) => t(key, instructionFallbacks[key]));
  };

  const handleDragPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || Platform.OS !== 'web') {
      return;
    }

    const currentPosition = clampPwaDragPosition(dragPosition ?? getDefaultPwaDragPosition(), getPwaDragViewport());
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      position: currentPosition,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) < PWA_DRAG_START_THRESHOLD) {
      return;
    }

    dragState.moved = true;
    const nextPosition = clampPwaDragPosition(
      { left: dragState.position.left + deltaX, top: dragState.position.top + deltaY },
      getPwaDragViewport()
    );
    setDragPosition(nextPosition);
  };

  const finishPwaDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextPosition = clampPwaDragPosition(
      dragState.moved
        ? { left: dragState.position.left + event.clientX - dragState.startX, top: dragState.position.top + event.clientY - dragState.startY }
        : dragState.position,
      getPwaDragViewport()
    );
    setDragPosition(nextPosition);
    storePwaDragPosition(nextPosition);
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const openPlayStore = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const openedWindow = window.open(ANDROID_PLAY_STORE_URL, '_blank', 'noopener,noreferrer');
    if (!openedWindow) {
      window.location.assign(ANDROID_PLAY_STORE_URL);
    }
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

  const isAndroidBrowser = typeof window !== 'undefined' && /Android/i.test(window.navigator.userAgent);

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
                tertiaryLabel={isAndroidBrowser ? t('playStoreAction', 'Get the full app on Google Play') : undefined}
                onTertiaryAction={isAndroidBrowser ? openPlayStore : undefined}
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
            tertiaryLabel={!isCollapsed && !isOpenAppMode && isAndroidBrowser ? t('playStoreAction', 'Get the full app on Google Play') : undefined}
            onTertiaryAction={!isCollapsed && !isOpenAppMode && isAndroidBrowser ? openPlayStore : undefined}
        onExpand={expandPrompt}
        onPrimaryAction={isOpenAppMode ? openApp : installPWA}
        onClose={collapsePrompt}
      />
  );

  if (isCollapsed) {
    const effectiveDragPosition = clampPwaDragPosition(
      dragPosition ?? getDefaultPwaDragPosition(dockViewport),
      dockViewport
    );

    return (
      <div
        className="hp-pwa-wrapper hp-pwa-drag-layer"
        style={{
          left: `${Math.round(effectiveDragPosition.left)}px`,
          top: `${Math.round(effectiveDragPosition.top)}px`,
        }}
      >
        <div onMouseEnter={expandPrompt}>
          {promptCard}
        </div>
        <button
          type="button"
          className="hp-pwa-drag-handle"
          aria-label={t('dragHandle', 'Drag install button')}
          title={t('dragHandle', 'Drag install button')}
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={finishPwaDrag}
          onPointerCancel={finishPwaDrag}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="5" cy="4" r="1" />
            <circle cx="11" cy="4" r="1" />
            <circle cx="5" cy="8" r="1" />
            <circle cx="11" cy="8" r="1" />
            <circle cx="5" cy="12" r="1" />
            <circle cx="11" cy="12" r="1" />
          </svg>
        </button>
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
