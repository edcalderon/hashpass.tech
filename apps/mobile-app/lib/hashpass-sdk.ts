import { createHashpass, type HashpassClient } from '@hashpass-tech/sdk';
import { supabase } from './supabase';

let cachedClient: HashpassClient | null = null;

/**
 * Lazily-created Hashpass SDK client, scoped to what the native app needs
 * today: HashPass Auth (QR login) via `client.authQr.respondToLogin()`,
 * approving a browser-side login under the app's own Supabase session.
 * `linksApiBaseUrl` has no stable default yet (hashpass.link DNS/infra
 * pending) -- see apps/mobile-app/.env.example.
 */
export function hashpassSdk(): HashpassClient {
  if (cachedClient) return cachedClient;

  cachedClient = createHashpass({
    appId: process.env.EXPO_PUBLIC_HASHPASS_APP_ID || 'hashpass-mobile-app',
    linksApiBaseUrl: process.env.EXPO_PUBLIC_LINKS_API_BASE_URL || undefined,
    auth: {
      getAccessToken: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      },
    },
  });
  return cachedClient;
}
