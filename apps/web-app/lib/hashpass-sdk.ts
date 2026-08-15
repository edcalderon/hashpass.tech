import { createHashpass, type HashpassClient } from '@hashpass/sdk';

let cachedClient: HashpassClient | null = null;

/**
 * Lazily-created Hashpass SDK client, scoped to what this static site
 * actually needs today: HashPass Auth (QR login) via `client.authQr`.
 * `linksApiBaseUrl` has no stable default yet (hashpass.link DNS/infra
 * pending) -- see apps/web-app/.env.example.
 */
export function hashpassSdk(): HashpassClient {
  if (cachedClient) return cachedClient;

  cachedClient = createHashpass({
    appId: process.env.NEXT_PUBLIC_HASHPASS_APP_ID || 'hashpass-club-web',
    linksApiBaseUrl: process.env.NEXT_PUBLIC_LINKS_API_BASE_URL || undefined,
  });
  return cachedClient;
}
