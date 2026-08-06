import type { EmailLocale, EmailTemplate, TemplateVars } from './types';
import { TEMPLATES, ASSET_DATA_URIS } from './generated-templates';

const SUPPORTED_LOCALES: EmailLocale[] = ['en', 'es', 'ko', 'fr', 'pt', 'de'];
const DEFAULT_LOCALE: EmailLocale = 'en';

/**
 * Returns a small brand asset (logo, etc.) as a base64 data URI, for inlining
 * directly into email HTML instead of depending on S3/CDN hosting env vars
 * being configured in every environment that sends mail. Sourced from
 * generated-templates.ts (see generate-templates.mjs) rather than reading
 * packages/emails/assets/* from disk at runtime -- that depended on the
 * assets directory existing on disk relative to a guessed __dirname inside
 * the deployed Lambda bundle, which it doesn't (the bundler only includes
 * JS/TS module content, not sibling static-file directories).
 */
export function getEmailAssetDataUri(assetName: string, _mimeType: string): string {
  const dataUri = ASSET_DATA_URIS[assetName];
  if (!dataUri) {
    console.warn(`[emails] Could not find asset ${assetName} in generated-templates.ts (run generate-templates.mjs after adding it)`);
    return '';
  }
  return dataUri;
}

export function renderTemplate(
  template: EmailTemplate,
  locale: string,
  vars: TemplateVars = {}
): string {
  const safeLocale: EmailLocale = SUPPORTED_LOCALES.includes(locale as EmailLocale)
    ? (locale as EmailLocale)
    : DEFAULT_LOCALE;

  const html = TEMPLATES[template]?.[safeLocale];
  if (!html) {
    throw new Error(`[emails] Unknown template "${template}" for locale "${safeLocale}" (checked generated-templates.ts)`);
  }

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

  let rendered = html;
  for (const [key, value] of Object.entries(resolved)) {
    // Convert camelCase keys to UPPER_SNAKE_CASE to match {{APP_URL}}-style placeholders
    const placeholder = key.replace(/([A-Z])/g, '_$1').toUpperCase();
    rendered = rendered.split(`{{${placeholder}}}`).join(String(value ?? ''));
  }

  return rendered;
}
