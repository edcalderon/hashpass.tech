import { renderTemplate } from './renderer';

export type HashpassEmailSignature = {
  html: string;
  text: string;
  portraitUrl: string;
  logoUrl: string;
};

const ASSET_BASE_URL = 'https://hashpass.tech/email-signature';

/** Returns Edward Calderón's complete, email-safe Hashpass signature. */
export function renderEdwardCalderonHashpassEmailSignature(): HashpassEmailSignature {
  const portraitUrl = `${ASSET_BASE_URL}/edward-calderon-portrait.d9bcbc18d656.jpg`;
  const logoUrl = `${ASSET_BASE_URL}/hashpass-wordmark.c3bcc34c86c.png`;

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
