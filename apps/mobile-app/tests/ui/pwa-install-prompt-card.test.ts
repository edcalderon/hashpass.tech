/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

const readSource = (relativePath: string) =>
  fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

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

  it('keeps the collapsed PWA button draggable with persisted placement', () => {
    const promptSource = readSource('../../../../apps/mobile-app/components/PWAPrompt.tsx');
    const dragSource = readSource('../../../../apps/mobile-app/lib/pwa-drag.ts');

    expect(dragSource).toContain("export const PWA_DRAG_POSITION_KEY = 'hashpass:pwa-install-position';");
    expect(dragSource).toContain('export const clampPwaDragPosition');
    expect(promptSource).toContain('setPointerCapture?.(event.pointerId)');
    expect(promptSource).toContain('releasePointerCapture?.(event.pointerId)');
    expect(promptSource).toContain('storePwaDragPosition(finalPosition)');
    expect(promptSource).toContain('onPointerDown={handleDragPointerDown}');
    expect(promptSource).toContain('onPointerMove={handleDragPointerMove}');
    expect(promptSource).toContain('onPointerUp={handleDragPointerEnd}');
    expect(promptSource).toContain('onClickCapture={handleDragClickCapture}');
    expect(promptSource).toContain('hp-pwa-drag-layer');
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

  it('shows hover and active drop indicators for the draggable PWA button', () => {
    const source = readSource('../../../../apps/mobile-app/app/global.css');

    expect(source).toContain('.hp-pwa-drag-layer');
    expect(source).toContain('.hp-pwa-drag-layer::before');
    expect(source).toContain('.hp-pwa-drag-layer::after');
    expect(source).toContain('.hp-pwa-drag-layer:hover::before');
    expect(source).toContain('.hp-pwa-drag-layer.hp-pwa-dragging::before');
    expect(source).toContain('cursor: grab;');
    expect(source).toContain('cursor: grabbing;');
    expect(source).toContain('touch-action: none;');
  });
});
