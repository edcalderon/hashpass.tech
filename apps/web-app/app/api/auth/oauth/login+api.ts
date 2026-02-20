
const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';
const DEFAULT_RETURN_TO = '/dashboard/explore';

function normalizeReturnToPath(path: string): string {
  let normalized = path;

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep original value if decoding fails.
  }

  if (!normalized.startsWith('/')) {
    return DEFAULT_RETURN_TO;
  }

  // Expo Router groups are internal-only and should not be used in browser URLs.
  normalized = normalized.replace(/\/\([^/]+\)/g, '');

  if (!normalized || normalized === '/auth' || normalized.includes('/auth/callback')) {
    return DEFAULT_RETURN_TO;
  }

  return normalized;
}

/**
 * OAuth Login Proxy
 * 
 * This redirect-based approach works as follows:
 * 1. Browser hits this endpoint
 * 2. We redirect to Directus /auth/login/{provider}?redirect={callback_on_our_domain}
 * 3. Directus redirects to Google
 * 4. Google redirects back to Directus
 * 5. Directus processes OAuth, sets refresh_token cookie on ITS domain, redirects to our callback
 * 6. Our callback endpoint receives the redirect but CANNOT read Directus cookies (cross-domain)
 * 
 * CRITICAL INSIGHT: Directus v11 NEVER puts tokens in the URL when redirect is used.
 * It always uses cookies. Since we're cross-domain, cookies are invisible.
 * 
 * SOLUTION: Encode feOrigin and returnTo in the redirect URL itself so the callback
 * knows where to redirect on failure/success. And have the callback do a server-side
 * call to Directus to try to get the session.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'google';
  const returnTo = normalizeReturnToPath(url.searchParams.get('returnTo') || DEFAULT_RETURN_TO);
  const feOrigin = url.searchParams.get('feOrigin') || '';

  console.log('[OAuth Login] Starting OAuth flow via Directus');
  console.log('[OAuth Login] Provider:', provider);
  console.log('[OAuth Login] Return to:', returnTo);
  console.log('[OAuth Login] Frontend origin:', feOrigin);

  // Validate provider
  const validProviders = ['google', 'discord', 'github'];
  if (!validProviders.includes(provider)) {
    console.error('[OAuth Login] Invalid provider:', provider);
    const errorTarget = feOrigin || url.origin;
    const errorUrl = new URL('/auth', errorTarget);
    errorUrl.searchParams.set('error', 'invalid_provider');
    errorUrl.searchParams.set('message', `Provider '${provider}' is not supported`);
    return new Response(null, { status: 302, headers: { 'Location': errorUrl.toString() } });
  }

  // Build callback URL with feOrigin and returnTo encoded as query params
  // (cookies don't survive cross-domain redirect chains through Directus)
  const callbackUrl = new URL('/api/auth/oauth/callback', url.origin);
  callbackUrl.searchParams.set('fe', feOrigin);
  callbackUrl.searchParams.set('rt', returnTo);

  const directusOAuthUrl = new URL(`/auth/login/${encodeURIComponent(provider)}`, DIRECTUS_URL);
  directusOAuthUrl.searchParams.set('mode', 'json');
  directusOAuthUrl.searchParams.set('redirect', callbackUrl.toString());
  if (provider === 'google') {
    directusOAuthUrl.searchParams.set('prompt', 'consent');
  }

  console.log('[OAuth Login] Callback URL:', callbackUrl.toString());
  console.log('[OAuth Login] Directus OAuth URL:', directusOAuthUrl.toString());

  return new Response(null, {
    status: 302,
    headers: {
      'Location': directusOAuthUrl.toString(),
      'Cache-Control': 'no-store'
    }
  });
}
