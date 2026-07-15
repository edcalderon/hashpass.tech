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

  it('keeps the collapsed PWA opener separate from the dock placement controls', () => {
    const promptSource = readSource('../../../../apps/mobile-app/components/PWAPrompt.tsx');
    const dragSource = readSource('../../../../apps/mobile-app/lib/pwa-drag.ts');

    expect(dragSource).toContain("export const PWA_DRAG_POSITION_KEY = 'hashpass:pwa-install-position';");
    expect(dragSource).toContain("export const PWA_DOCK_POSITIONS = ['top-left', 'bottom-left', 'bottom-right'] as const;");
    expect(dragSource).toContain('export const clampPwaDragPosition');
    expect(dragSource).toContain('export const resolveNearestPwaDockPosition');
    expect(promptSource).toContain("className=\"hp-pwa-dock-controls\"");
    expect(promptSource).toContain('className={`hp-pwa-dock-target hp-pwa-dock-target-${position}');
    expect(promptSource).toContain('const [showDockControls, setShowDockControls] = useState(false);');
    expect(promptSource).toContain("document.addEventListener('pointerdown', handleOutsidePointerDown);");
    expect(promptSource).toContain('setShowDockControls(false);');
    expect(promptSource).toContain("event.key === 'Escape'");
    expect(promptSource).toContain('onPointerEnter={() => setShowDockControls(true)}');
    expect(promptSource).toContain('onPointerLeave={hidePwaDockControls}');
    expect(promptSource).toContain('onBlurCapture={(event) => {');
    expect(promptSource).toContain('storePwaDockPosition(nextDockPosition)');
    expect(promptSource).toContain('onExpand={expandPrompt}');
    expect(promptSource).not.toContain('onClickCapture=');
    expect(promptSource).not.toContain('onPointerDown={handleDragPointerDown}');
    expect(promptSource).not.toContain('suppressNextClickAfterDragRef');
    expect(promptSource).not.toContain('DRAG_SYNTHETIC_CLICK_SUPPRESS_MS');
    expect(promptSource).toContain('hp-pwa-dock-layer');
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

  it('shows hover dock indicators for the PWA button placement controls', () => {
    const source = readSource('../../../../apps/mobile-app/app/global.css');
    const dockControlsRule = readCssRule(source, '.hp-pwa-dock-controls');
    const dockTargetRule = readCssRule(source, '.hp-pwa-dock-target');

    expect(source).toContain('.hp-pwa-dock-layer');
    expect(source).toContain('.hp-pwa-dock-layer::before');
    expect(source).toContain('.hp-pwa-dock-layer.hp-pwa-dock-controls-visible::before');
    expect(source).toContain('.hp-pwa-dock-layer.hp-pwa-dock-controls-visible .hp-pwa-dock-controls');
    expect(source).toContain('.hp-pwa-dock-controls');
    expect(source).toContain('.hp-pwa-dock-target-top-left');
    expect(source).toContain('.hp-pwa-dock-target-bottom-left');
    expect(source).toContain('.hp-pwa-dock-target-bottom-right');
    expect(source).toContain('cursor: pointer;');
    expect(source).toContain('touch-action: manipulation;');
    expect(dockControlsRule).toContain('pointer-events: none;');
    expect(dockTargetRule).toContain('pointer-events: none;');
    expect(source).toContain('.hp-pwa-dock-layer.hp-pwa-dock-controls-visible .hp-pwa-dock-target');
    expect(source).toContain('pointer-events: auto;');
    expect(source).not.toContain('cursor: grabbing;');
  });
});
