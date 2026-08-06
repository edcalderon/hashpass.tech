import fs from 'fs';
import path from 'path';
import type { EmailLocale, EmailTemplate, TemplateVars } from './types';

const SUPPORTED_LOCALES: EmailLocale[] = ['en', 'es', 'ko', 'fr', 'pt', 'de'];
const DEFAULT_LOCALE: EmailLocale = 'en';

// Metro server bundles replace __dirname with the API route entry dir, not this file's dir.
// Walk a set of candidates and use the first that contains a known probe file,
// relative to this package's own root (parameterized so both templates/ and
// assets/ -- siblings under packages/emails -- can reuse the same search).
function resolvePackageSubdir(subdir: string, probe: string[]): string {
  const candidates = [
    path.resolve(__dirname, '..', subdir),                                  // native Node.js (correct)
    path.resolve(__dirname, '..', '..', 'packages', 'emails', subdir),      // __dirname = apps/mobile-app/
    path.resolve(__dirname, '..', '..', '..', 'packages', 'emails', subdir), // __dirname = apps/mobile-app/app/
    path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'emails', subdir), // __dirname = apps/mobile-app/app/api/
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, ...probe))) return dir;
    } catch { /* noop */ }
  }
  return candidates[0];
}

const TEMPLATES_DIR = resolvePackageSubdir('templates', ['newsletter-welcome', 'en.html']);
const ASSETS_DIR = resolvePackageSubdir('assets', ['logo-hashpass-white-cyan.png']);

/**
 * Reads a file from packages/emails/assets and returns it as a base64 data
 * URI, for inlining small brand assets (logos) directly into email HTML
 * instead of depending on S3/CDN hosting env vars being configured in every
 * environment that sends mail.
 */
export function getEmailAssetDataUri(assetName: string, mimeType: string): string {
  try {
    const buffer = fs.readFileSync(path.join(ASSETS_DIR, assetName));
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.warn(`[emails] Could not load asset ${assetName}:`, error);
    return '';
  }
}

export function renderTemplate(
  template: EmailTemplate,
  locale: string,
  vars: TemplateVars = {}
): string {
  const safeLocale: EmailLocale = SUPPORTED_LOCALES.includes(locale as EmailLocale)
    ? (locale as EmailLocale)
    : DEFAULT_LOCALE;

  const templatePath = path.join(TEMPLATES_DIR, template, `${safeLocale}.html`);
  let html = fs.readFileSync(templatePath, 'utf-8');

  // Defaults come first so an explicitly-passed var always wins -- a later
  // spread key overrides an earlier one with the same name in JS object
  // literals, so putting the defaults after `...vars` (as this used to)
  // silently discarded every caller-supplied value, including userName.
  const resolved = {
    year: String(new Date().getFullYear()),
    appUrl: 'https://hashpass.tech',
    supportEmail: 'support@hashpass.tech',
    userName: '',
    userInitial: '',
    logoUrl: '',
    unsubscribeUrl: '',
    ...vars,
  } satisfies Required<TemplateVars>;

  for (const [key, value] of Object.entries(resolved)) {
    // Convert camelCase keys to UPPER_SNAKE_CASE to match {{APP_URL}}-style placeholders
    const placeholder = key.replace(/([A-Z])/g, '_$1').toUpperCase();
    html = html.split(`{{${placeholder}}}`).join(String(value ?? ''));
  }

  return html;
}
