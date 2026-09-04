/// <reference types="jest" />

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

import {
  renderEdwardCalderonHashpassEmailSignature,
  renderTemplate,
  getEmailAssetDataUri,
  getSubject,
} from '../../../../packages/emails/src';

const SUPPORTED_LOCALES = ['en', 'es', 'ko', 'fr', 'pt', 'de'];
const REPOSITORY_ROOT = resolve(__dirname, '../../../..');

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

  it.each(SUPPORTED_LOCALES)('keeps the Supabase verification URL in auth-magic-link for locale %s', (locale) => {
    // Supabase replaces this Go-template value with its one-time verification
    // URL when it sends the message. It must never point only at RedirectTo
    // or SiteURL, which produces a callback with no authentication payload.
    const html = renderTemplate('auth-magic-link', locale);

    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('href="{{ .ConfirmationURL }}"');
    expect(html).toContain('https://hashpass.tech/assets/email/logo-full-hashpass-white-cyan.png');
    expect(html).not.toContain('/assets/logos/');
    expect(html).not.toContain('href="{{ .RedirectTo }}"');
    expect(html).not.toContain('href="{{ .SiteURL }}"');
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(getSubject('auth-magic-link', locale)).toMatch(/HASHPASS/);
  });

  it('ships the auth magic-link logo as a public email asset', () => {
    expect(
      existsSync(
        resolve(
          REPOSITORY_ROOT,
          'apps/mobile-app/public/assets/email/logo-full-hashpass-white-cyan.png',
        ),
      ),
    ).toBe(true);
  });

  it('provides one Supabase-ready template that chooses locale from auth metadata', () => {
    const html = readFileSync(
      resolve(REPOSITORY_ROOT, 'packages/emails/templates/auth-magic-link/unified.html'),
      'utf8',
    );

    for (const locale of ['es', 'pt', 'fr', 'de', 'ko']) {
      expect(html).toContain(`eq .Data.locale "${locale}"`);
    }
    expect(html).toContain('{{ .ConfirmationURL }}');
    expect(html).not.toContain('{{ .RedirectTo }}');
    expect(html).not.toContain('{{ .SiteURL }}');

    const authScreen = readFileSync(
      resolve(REPOSITORY_ROOT, 'apps/mobile-app/app/(shared)/auth.tsx'),
      'utf8',
    );
    // Magic links are now minted and delivered by the backend; the client
    // passes locale to that endpoint rather than calling Supabase directly.
    expect(authScreen).toContain('locale: currentLocale');
    expect(authScreen).toContain('"/auth/magic-link"');
  });

  it('renders the English welcome as a clear HASHPASS onboarding message', () => {
    const html = renderTemplate('app-welcome', 'en', {
      userName: 'Edward Calderon',
      userInitial: 'E',
      logoUrl: 'data:image/png;base64,official-hashpass-wordmark',
    });

    // Keep the welcome experience human and product-led: the actual brand
    // wordmark, a plain-language headline, and an unambiguous next step.
    expect(html).toContain('data:image/png;base64,official-hashpass-wordmark');
    expect(html).toContain('Welcome to the<br>network.');
    expect(html).toContain('Open HASHPASS');
    expect(html).not.toContain('id.init');
    expect(html).not.toContain('initialize_my_pass');
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

  it('ships Edward Calderón’s Hashpass signature with immutable CDN assets', () => {
    const signature = renderEdwardCalderonHashpassEmailSignature();

    expect(signature.html).toContain('<!doctype html>');
    expect(signature.html).toContain('Edward Calderón');
    expect(signature.html).toContain('Co-founder &amp; CEO');
    expect(signature.portraitUrl).toBe(
      'https://hashpass.tech/email-signature/edward-calderon-portrait.d9bcbc18d656.jpg',
    );
    expect(signature.logoUrl).toBe(
      'https://hashpass.tech/email-signature/hashpass-wordmark.c3bcc34c86c.png',
    );
  });
});
