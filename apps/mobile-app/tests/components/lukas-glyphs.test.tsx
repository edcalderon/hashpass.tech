/// <reference types="jest" />

import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/LukasGlyph.css', () => ({}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/useLukasMotion', () => ({
  useLukasAnimationLevel: () => 'none',
  useSceneActivity: jest.fn(),
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/hooks/useTheme', () => ({
  useTheme: () => ({ isDark: false }),
}), { virtual: true });

import { LukasGlyph } from '../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/LukasGlyph';

const LINE_ICONS = ['coffee', 'event', 'market', 'network', 'reserve', 'shield', 'settings', 'wallet'] as const;
const glyphStylesPath = resolve(
  __dirname,
  '../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/LukasGlyph.css',
);

describe('LUKAS line icon system', () => {
  it.each(LINE_ICONS)('renders %s as a tile-free geometric line icon', (name) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<LukasGlyph name={name} size={48} />); });

    expect(renderer.root.findByProps({ className: 'lk-glyph__icon' }).props.viewBox).toBe('0 0 48 48');
    expect(renderer.root.findAllByProps({ className: 'lk-glyph__tile' })).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('uses one rounded stroke weight without gradient tiles', () => {
    const styles = readFileSync(glyphStylesPath, 'utf8');
    const iconRule = styles.match(/\.lk-glyph__icon\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(iconRule).toMatch(/stroke-width:\s*2\.6/);
    expect(iconRule).toMatch(/stroke-linecap:\s*round/);
    expect(iconRule).toMatch(/stroke-linejoin:\s*round/);
    expect(styles).not.toMatch(/lk-glyph__tile|linear-gradient/);
  });

  it('animates full-motion line glyphs while pausing them off-screen and for reduced motion', () => {
    const styles = readFileSync(glyphStylesPath, 'utf8');

    expect(styles).toMatch(/\.lk-glyph\[data-motion="full"\]:not\(\.lk-glyph--coin\)\s+\.lk-glyph__icon\s*\{[^}]*animation:/);
    expect(styles).toMatch(/\.lk-glyph\[data-active="false"\]:not\(\.lk-glyph--coin\)\s+\.lk-glyph__icon\s*\{[^}]*animation-play-state:\s*paused/);
    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[^{]*\{[^}]*animation:\s*none/);
  });
});
