/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

const readCssRule = (source: string, selector: string) => {
  const match = source.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? '';
};

describe('PWA install prompt layout', () => {
  const canonicalPwaGuideUrl =
    'https://hashpass.club/documentation/guides/install-hashpass/';

  it('keeps the shared card split into header, scroll body, and footer sections', () => {
    const source = readSource('../../../../packages/ui/src/PwaInstallPromptCard.tsx');

    expect(source).toContain('className="hp-pwa-intro"');
    expect(source).toContain('className="hp-pwa-body-scroll"');
    expect(source).toContain('className="hp-pwa-footer"');
    expect(source).toContain('flex: 1 1 auto;');
    expect(source).toContain('max-height: calc(100svh - 24px);');
    expect(source).toContain('overflow-y: auto;');
    expect(source).toContain('flex-direction: column;');
  });

  it('keeps the mobile bottom sheet from scrolling the entire card container', () => {
    const source = readSource('../../../../apps/mobile-app/app/global.css');

    expect(source).toContain('max-height: calc(100svh - 16px) !important;');
    expect(source).toContain('overflow: hidden !important;');
    expect(source).not.toContain('max-height: 50vh !important;');
    expect(source).not.toContain('overflow-y: auto !important;');
  });

  it('adds an auto-scrolling overlay for the help modal fallback', () => {
    const source = readSource('../../../../apps/mobile-app/components/PWAPrompt.tsx');

    expect(source).toContain("overflowY: 'auto'");
    expect(source).toContain("WebkitOverflowScrolling: 'touch'");
  });

  it('returns to the collapsed launcher when install instructions are closed', () => {
    const source = readSource('../../../../apps/mobile-app/components/PWAPrompt.tsx');

    expect(source).toContain('const closeInstallHelpModal = () => {\n    setShowInstallHelpModal(false);\n    collapsePrompt();\n  };');
    expect(source).toContain('onPrimaryAction={closeInstallHelpModal}');
    expect(source).toContain('onClose={closeInstallHelpModal}');
  });

  it('keeps the collapsed PWA opener freely draggable through its dedicated handle', () => {
    const promptSource = readSource('../../../../apps/mobile-app/components/PWAPrompt.tsx');
    const dragSource = readSource('../../../../apps/mobile-app/lib/pwa-drag.ts');

    expect(dragSource).toContain("export const PWA_DRAG_POSITION_KEY = 'hashpass:pwa-install-position';");
    expect(dragSource).toContain('export const clampPwaDragPosition');
    expect(promptSource).toContain('const [dragPosition, setDragPosition] = useState<PwaDragPosition | null>(null);');
    expect(promptSource).toContain('className="hp-pwa-drag-handle"');
    expect(promptSource).toContain('onPointerDown={handleDragPointerDown}');
    expect(promptSource).toContain('storePwaDragPosition(nextPosition)');
    expect(promptSource).toContain('onExpand={expandPrompt}');
    expect(promptSource).toContain('hp-pwa-drag-layer');
    expect(promptSource).toContain('hp-pwa-dismiss-zone');
    expect(promptSource).toContain('isPwaDragPositionInDismissZone');
    expect(promptSource).toContain('dismissPromptUntilReload();');
    expect(promptSource).not.toContain('PWA_DOCK_POSITIONS');
    expect(promptSource).not.toContain('hp-pwa-dock-controls');
  });

  it('gives the draggable launcher a keyboard fallback and a 44px touch target', () => {
    const promptSource = readSource('../../../../apps/mobile-app/components/PWAPrompt.tsx');
    const cssSource = readSource('../../../../apps/mobile-app/app/global.css');
    const dragHandleRule = readCssRule(cssSource, '.hp-pwa-drag-handle');

    expect(promptSource).toMatch(/onKeyDown=\{[^}]+\}/);
    expect(promptSource).toContain("event.key === 'ArrowUp'");
    expect(promptSource).toContain("event.key === 'ArrowDown'");
    expect(promptSource).toContain("event.key === 'ArrowLeft'");
    expect(promptSource).toContain("event.key === 'ArrowRight'");
    expect(dragHandleRule).toContain('min-width: 44px;');
    expect(dragHandleRule).toContain('min-height: 44px;');
  });

  it('renders the dont-show-again action as an accessible secondary button', () => {
    const promptSource = readSource('../../../../apps/mobile-app/components/PWAPrompt.tsx');
    const cardSource = readSource('../../../../packages/ui/src/PwaInstallPromptCard.tsx');

    expect(promptSource).toContain('secondaryLabel={!isCollapsed && !isOpenAppMode');
    expect(promptSource).toContain('onSecondaryAction={!isCollapsed && !isOpenAppMode ? handleDontShowAgain : undefined}');
    expect(promptSource).not.toContain("'▢ ' + t('");
    expect(cardSource).toContain('secondaryLabel?: string;');
    expect(cardSource).toContain('onSecondaryAction?: () => void;');
    expect(cardSource).toContain('className="hp-pwa-secondary-action"');
  });

  it('uses a compact drag affordance instead of snap-position targets', () => {
    const source = readSource('../../../../apps/mobile-app/app/global.css');

    expect(source).toContain('.hp-pwa-drag-layer');
    expect(source).toContain('.hp-pwa-drag-handle');
    expect(source).toContain('cursor: grab;');
    expect(source).toContain('touch-action: none;');
    expect(source).toContain('.hp-pwa-dismiss-zone');
    expect(source).not.toContain('.hp-pwa-dock-target-top-left');
    expect(source).not.toContain('.hp-pwa-dock-target-bottom-left');
    expect(source).not.toContain('.hp-pwa-dock-target-bottom-right');
  });

  it('expands the web launcher on hover while retaining its touch click path', () => {
    const source = readSource('../../../../apps/mobile-app/components/PWAPrompt.tsx');

    expect(source).toContain('onMouseEnter={expandPrompt}');
    expect(source).toContain('onExpand={expandPrompt}');
  });

  it('offers translated PWA-or-store copy without exposing a direct app-store action', () => {
    const promptSource = readSource('../../../../apps/mobile-app/components/PWAPrompt.tsx');
    const expectedDescriptions = {
      en: 'Install HASHPASS as a PWA or download the app from your preferred app store. Available now on Google Play.',
      es: 'Instala HASHPASS como PWA o descarga la aplicación desde tu tienda de aplicaciones preferida. Ya disponible en Google Play.',
      ko: 'HASHPASS를 PWA로 설치하거나 선호하는 앱 스토어에서 앱을 다운로드하세요. 지금 Google Play에서 이용할 수 있습니다.',
      de: 'Installiere HASHPASS als PWA oder lade die App aus deinem bevorzugten App-Store herunter. Jetzt bei Google Play verfügbar.',
      fr: 'Installez HASHPASS en tant que PWA ou téléchargez l’application depuis votre boutique d’applications préférée. Disponible dès maintenant sur Google Play.',
      pt: 'Instale o HASHPASS como PWA ou baixe o aplicativo na sua loja de aplicativos preferida. Já disponível no Google Play.',
    } as const;

    expect(promptSource).toMatch(/t\(\s*['"]installDescription['"]/);

    for (const [locale, expectedDescription] of Object.entries(expectedDescriptions)) {
      const messages = JSON.parse(
        readSource(`../../../../apps/mobile-app/i18n/locales/${locale}.json`)
      ) as { pwaPrompt?: { installDescription?: string } };

      expect(messages.pwaPrompt?.installDescription).toBe(expectedDescription);
    }

    expect(promptSource).not.toMatch(/https?:\/\/(?:play\.google\.com|apps\.apple\.com)/i);
    expect(promptSource).not.toMatch(/\b(?:ANDROID_PLAY_STORE_URL|openPlayStore|playStoreAction)\b/);
    expect(promptSource).not.toMatch(/(?:tertiaryLabel|onTertiaryAction)\s*=/);
  });

  it('renders learn more as a semantic, safely external anchor', () => {
    const cardSource = readSource('../../../../packages/ui/src/PwaInstallPromptCard.tsx');

    expect(cardSource).toContain('learnMoreLabel?: string;');
    expect(cardSource).toContain('learnMoreHref?: string;');
    expect(cardSource).toContain('className="hp-pwa-learn-more"');
    expect(cardSource).toContain('href={learnMoreHref}');
    expect(cardSource).toContain('target="_blank"');
    expect(cardSource).toContain('rel="noopener noreferrer"');
    expect(cardSource).not.toMatch(
      /<button[^>]*className=["']hp-pwa-learn-more["']/s,
    );
  });

  it('points both install-prompt presentations to the canonical PWA guide', () => {
    const promptSource = readSource('../../../../apps/mobile-app/components/PWAPrompt.tsx');

    expect(promptSource).toContain(canonicalPwaGuideUrl);
    expect(promptSource).toMatch(/learnMoreLabel=\{t\(\s*['"]learnMore['"]/);
    expect(promptSource.match(/learnMoreHref=/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('translates the PWA guide link in every supported locale', () => {
    const expectedLearnMore = {
      en: 'Learn more about installing HASHPASS',
      es: 'Más información sobre cómo instalar HASHPASS',
      ko: 'HASHPASS 설치 방법 자세히 알아보기',
      de: 'Mehr über die Installation von HASHPASS erfahren',
      fr: 'En savoir plus sur l’installation de HASHPASS',
      pt: 'Saiba mais sobre como instalar o HASHPASS',
    } as const;

    for (const [locale, expectedLabel] of Object.entries(expectedLearnMore)) {
      const messages = JSON.parse(
        readSource(`../../../../apps/mobile-app/i18n/locales/${locale}.json`)
      ) as { pwaPrompt?: { learnMore?: string } };

      expect(messages.pwaPrompt?.learnMore).toBe(expectedLabel);
    }
  });
});
