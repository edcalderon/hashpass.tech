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
});
