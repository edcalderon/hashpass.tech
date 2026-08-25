import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(
  new URL('./HeroSection.tsx', import.meta.url),
  'utf8',
);

test('uses a dark, high-contrast badge in light mode', () => {
  assert.match(source, /const badgeBg\s*=\s*isDark\s*\?[^\n]+:\s*'#0b1f3a'/);
  assert.match(source, /const badgeText\s*=\s*isDark\s*\?[^\n]+:\s*'#f4f8ff'/);
});

test('uses a theme-aware color field when a headline letter is hovered or pressed', () => {
  assert.match(source, /--club-letter-blend'?:\s*isDark\s*\?\s*'screen'\s*:\s*'normal'/);
  assert.match(source, /onPointerDown=\{\(event\) => moveTitleLetter\(event, index\)\}/);
  assert.match(source, /mix-blend-mode:\s*var\(--club-letter-blend\)/);
  assert.match(source, /var\(--club-letter-bright\)/);
  assert.match(source, /var\(--club-letter-deep\)/);
});
