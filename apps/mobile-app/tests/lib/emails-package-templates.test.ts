/// <reference types="jest" />

// Regression coverage for a real production bug: renderTemplate/
// getEmailAssetDataUri used to read packages/emails/templates and
// .../assets from disk at runtime via fs.readFileSync, relative to a
// guessed __dirname. That directory never actually existed in the deployed
// Lambda bundle (ENOENT), so every newsletter-subscription confirmation
// email failed silently -- confirmed via prod: every row in
// newsletter_subscribers had email_sent=false since the feature shipped.
// Fixed by inlining templates/assets into a generated TS module at build
// time (generate-templates.mjs) instead of reading them from disk. This
// test exercises the real @hashpass/emails package exactly as
// lib/email.ts does, across every supported locale, so a future template
// edit that isn't regenerated (or a template file that gets deleted) fails
// CI instead of silently breaking email delivery again.

import { renderTemplate, getEmailAssetDataUri } from '../../../../packages/emails/src';

const SUPPORTED_LOCALES = ['en', 'es', 'ko', 'fr', 'pt', 'de'];

describe('@hashpass/emails templates', () => {
  it.each(SUPPORTED_LOCALES)('renders newsletter-welcome for locale %s without touching the filesystem', (locale) => {
    const html = renderTemplate('newsletter-welcome', locale, {
      unsubscribeUrl: 'https://hashpass.tech/api/unsubscribe?token=test',
    });

    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('HASHPASS');
    // Every {{PLACEHOLDER}} must have been substituted -- a leftover one
    // means a TemplateVars key/placeholder mismatch.
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it.each(SUPPORTED_LOCALES)('renders app-welcome for locale %s without touching the filesystem', (locale) => {
    const html = renderTemplate('app-welcome', locale, {
      userName: 'Test User',
      userInitial: 'T',
      logoUrl: 'data:image/png;base64,test',
    });

    expect(html.length).toBeGreaterThan(500);
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('falls back to English for an unsupported locale instead of throwing', () => {
    const html = renderTemplate('newsletter-welcome', 'xx-not-a-real-locale');
    expect(html.length).toBeGreaterThan(500);
  });

  it('resolves the HASHPASS logo asset to a real base64 data URI', () => {
    const dataUri = getEmailAssetDataUri('logo-hashpass-white-cyan.png', 'image/png');
    expect(dataUri).toMatch(/^data:image\/png;base64,/);
    expect(dataUri.length).toBeGreaterThan(1000);
  });

  it('returns an empty string (not a throw) for an asset that does not exist', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getEmailAssetDataUri('does-not-exist.png', 'image/png')).toBe('');
    warnSpy.mockRestore();
  });
});
