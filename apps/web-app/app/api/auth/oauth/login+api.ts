<<<<<<< Updated upstream
=======
import { ExpoRequest, ExpoResponse } from 'expo-router/server';
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
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
=======
 * Redirects to Directus OAuth provider
 * Directus handles the full OAuth flow with Google/Discord/etc and redirects back to /auth/callback
 * Route: /api/auth/oauth/login?provider=google&returnTo=...
 */
export async function GET(request: ExpoRequest): Promise<ExpoResponse> {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'google';
  const returnTo = normalizeReturnToPath(url.searchParams.get('returnTo') || DEFAULT_RETURN_TO);
>>>>>>> Stashed changes

  console.log('[OAuth Login] Starting OAuth flow via Directus');
  console.log('[OAuth Login] Provider:', provider);
  console.log('[OAuth Login] Return to:', returnTo);
<<<<<<< Updated upstream
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

  // Intercept Google provider before parsing generic fallback logic
  const callbackOrigin = feOrigin || url.origin || 'https://blockchainsummit-dev.hashpass.lat';

  // If provider is Google, intercept and redirect directly to Google OAuth
  if (provider === 'google') {
    const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    console.log('[OAuth Login] Initiating direct Google OAuth flow');
    const redirectUri = `${url.origin}/api/auth/oauth/google`;
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', googleClientId);
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'openid profile email');
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('prompt', 'consent');

    const isSecure = url.protocol === 'https:';
    const cookieOptions = isSecure ? 'Secure; SameSite=Lax' : 'SameSite=Lax';

    // Save absolute URL to redirect back to the correct domain instead of api-dev
    const absoluteReturnUrl = new URL(returnTo, callbackOrigin).toString();

    return new Response(null, {
      status: 302,
      headers: {
        'Location': googleAuthUrl.toString(),
        'Cache-Control': 'no-store',
        'Set-Cookie': `oauth_return_to=${encodeURIComponent(absoluteReturnUrl)}; Path=/; HttpOnly; Max-Age=3600; ${cookieOptions}`
      }
    });
  }

  // Build callback URL on the frontend for fallback Directus flow
  const relayUrl = new URL('/auth/callback', callbackOrigin);
  relayUrl.searchParams.set('rt', returnTo);

  const directusOAuthUrl = new URL(`/auth/login/${encodeURIComponent(provider)}`, DIRECTUS_URL);
  directusOAuthUrl.searchParams.set('mode', 'json');
  directusOAuthUrl.searchParams.set('redirect', relayUrl.toString());

  console.log('[OAuth Login] Relay URL (Callback):', relayUrl.toString());
  console.log('[OAuth Login] Directus OAuth URL:', directusOAuthUrl.toString());

  return new Response(null, {
    status: 302,
    headers: {
      'Location': directusOAuthUrl.toString(),
      'Cache-Control': 'no-store'
    }
=======

  // Validate provider - only use Directus-configured providers
  const validProviders = ['google', 'discord', 'github'];
  if (!validProviders.includes(provider)) {
    console.error('[OAuth Login] Invalid provider:', provider);
    const errorUrl = new URL('/auth', url.origin);
    errorUrl.searchParams.set('error', 'invalid_provider');
    errorUrl.searchParams.set('message', `Provider '${provider}' is not supported`);

    return new ExpoResponse(null, {
      status: 302,
      headers: { 'Location': errorUrl.toString() }
    });
  }

  const isHttps = url.protocol === 'https:';
  const secureFlag = isHttps ? '; Secure' : '';

  // Store return URL in cookie for callback fallback flows.
  const cookieValue = encodeURIComponent(returnTo);
  const setCookieHeader = `oauth_return_to=${cookieValue}; Path=/; SameSite=Lax; Max-Age=3600${secureFlag}`;

  // Redirect to Directus OAuth endpoint
  // Directus will:
  // 1. Redirect to the OAuth provider (Google, Discord, etc.)
  // 2. User authenticates
  // 3. Provider redirects back to Directus with auth code
  // 4. Directus exchanges code for tokens
  // 5. Directus redirects to /auth/callback with tokens in URL or cookies
  // Directus v11 OAuth endpoint format: /auth/login/{provider}?redirect={url}
  const callbackUrl = new URL('/auth/callback', url.origin);
  callbackUrl.searchParams.set('returnTo', returnTo);
  const directusOAuthUrl = new URL(`/auth/login/${encodeURIComponent(provider)}`, DIRECTUS_URL);
  directusOAuthUrl.searchParams.set('redirect', callbackUrl.toString());
  if (provider === 'google') {
    // Force a fresh provider consent flow to avoid reusing stale Directus admin/browser sessions.
    directusOAuthUrl.searchParams.set('prompt', 'consent');
  }

  console.log('[OAuth Login] Redirecting to Directus OAuth:', directusOAuthUrl.toString());

  const headers = new Headers();
  headers.set('Location', directusOAuthUrl.toString());
  headers.set('Cache-Control', 'no-store');
  headers.append('Set-Cookie', setCookieHeader);
  // Clear stale Directus host cookies before starting a new OAuth session.
  headers.append('Set-Cookie', `directus_session_token=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`);
  headers.append('Set-Cookie', `directus_refresh_token=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`);
  headers.append('Set-Cookie', `directus_refresh_token=; Path=/auth/refresh; SameSite=Lax; Max-Age=0${secureFlag}`);

  return new ExpoResponse(null, {
    status: 302,
    headers
>>>>>>> Stashed changes
  });
}
