import { createHashpass, type AuthProvider, type HashpassClient } from '@hashpass-tech/sdk';
import { supabaseClient } from './supabase-client';

let cachedClient: HashpassClient | null = null;

// Reads the Supabase session fresh on every call rather than snapshotting
// a token -- the cached SDK client below is a long-lived singleton, but the
// signed-in user's session changes (login/logout/refresh) over that
// lifetime, and `qrLinks`/`support`'s server-side auth has to see whichever
// session is current at request time, not whatever was current when this
// provider was constructed.
const supabaseSessionAuth: AuthProvider = {
  async getAccessToken() {
    const { data } = await supabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  },
};

/**
 * Lazily-created Hashpass SDK client. `client.authQr` (QR login) and
 * `client.qrLinks` (custom QR link creation/management, for the panel) both
 * live on the same hashpass.link service -- `qrLinks` additionally needs an
 * authenticated caller, which `auth` above provides from this app's own
 * Supabase browser session. `linksApiBaseUrl` has no stable default yet
 * (hashpass.link DNS/infra pending) -- see apps/web-app/.env.example.
 */
export function hashpassSdk(): HashpassClient {
  if (cachedClient) return cachedClient;

  cachedClient = createHashpass({
    appId: process.env.NEXT_PUBLIC_HASHPASS_APP_ID || 'hashpass-club-web',
    linksApiBaseUrl: process.env.NEXT_PUBLIC_LINKS_API_BASE_URL || undefined,
    auth: supabaseSessionAuth,
  });
  return cachedClient;
}
