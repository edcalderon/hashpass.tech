import { renderTemplate } from './renderer';

export type HashpassEmailSignature = {
  html: string;
  text: string;
  portraitUrl: string;
  logoUrl: string;
};

// Canonical public email assets. Keep these under apps/mobile-app/public so
// the static web deployment serves them with image content types. Do not use
// the old /email-signature SPA route or Markdown link syntax inside src.
const ASSET_BASE_URL = 'https://hashpass.tech/assets/email/signature';

/** Returns Edward Calderón's complete, email-safe Hashpass signature. */
export function renderEdwardCalderonHashpassEmailSignature(): HashpassEmailSignature {
  const portraitUrl = `${ASSET_BASE_URL}/edward-calderon-portrait.jpg`;
  const logoUrl = `${ASSET_BASE_URL}/hashpass-wordmark.png`;

  return {
    html: renderTemplate('email-signature', 'en'),
    text: [
      'Edward Calderón',
      'Co-founder & CEO · HASHPASS',
      'edward@hashpass.app | https://hashpass.tech | https://www.linkedin.com/in/edwardca-dev/',
    ].join('\n'),
    portraitUrl,
    logoUrl,
  };
}
