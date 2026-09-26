/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

const CANONICAL_PWA_GUIDE_URL =
  'https://hashpass.club/documentation/guides/install-hashpass/';
const source = fs.readFileSync(
  path.resolve(__dirname, '../../app/(shared)/docs.tsx'),
  'utf8',
);

describe('DocsScreen PWA guide action', () => {
  it('opens the canonical Install HASHPASS guide through cross-platform Linking', () => {
    expect(source).toContain(CANONICAL_PWA_GUIDE_URL);
    expect(source).toMatch(/message:\s*['"]Install HASHPASS(?: PWA guide)?['"]/);
    expect(source).toContain('accessibilityRole="link"');
    expect(source).toMatch(/Linking\.openURL\([A-Z_]*PWA[A-Z_]*GUIDE[A-Z_]*URL\)/);
  });

  it('keeps the guide action outside the web-only full-documentation block', () => {
    const guideActionIndex = source.search(
      /Linking\.openURL\([A-Z_]*PWA[A-Z_]*GUIDE[A-Z_]*URL\)/,
    );
    const webOnlyDocumentationIndex = source.indexOf("Platform.OS === 'web'");

    expect(guideActionIndex).toBeGreaterThan(0);
    expect(webOnlyDocumentationIndex).toBeGreaterThan(guideActionIndex);
  });
});
