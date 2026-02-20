

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
 * Redirects to Directus OAuth provider
 * Directus handles the full OAuth flow with Google/Discord/etc and redirects back to /auth/callback
 * Route: /api/auth/oauth/login?provider=google&returnTo=...
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'google';
  const returnTo = normalizeReturnToPath(url.searchParams.get('returnTo') || DEFAULT_RETURN_TO);
  const feOrigin = url.searchParams.get('feOrigin');

  console.log('[OAuth Login] Starting OAuth flow via Directus');
  console.log('[OAuth Login] Provider:', provider);
  console.log('[OAuth Login] Return to:', returnTo);

  // Validate provider - only use Directus-configured providers
  const validProviders = ['google', 'discord', 'github'];
  if (!validProviders.includes(provider)) {
    console.error('[OAuth Login] Invalid provider:', provider);
    const errorUrl = new URL('/auth', url.origin);
    errorUrl.searchParams.set('error', 'invalid_provider');
    errorUrl.searchParams.set('message', `Provider '${provider}' is not supported`);

    return new Response(null, {
      status: 302,
      headers: { 'Location': errorUrl.toString() }
    });
  }

  const isHttps = url.protocol === 'https:';
  const secureFlag = isHttps ? '; Secure' : '';

  // Store return URL in cookie for callback fallback flows.
  const cookieValue = encodeURIComponent(returnTo);
  const setCookieHeader = `oauth_return_to=${cookieValue}; Path=/; SameSite=Lax; Max-Age=3600${secureFlag}`;
  const feOriginCookie = feOrigin ? `oauth_fe_origin=${encodeURIComponent(feOrigin)}; Path=/; SameSite=Lax; Max-Age=3600${secureFlag}` : null;

  // Redirect to Directus OAuth endpoint
  // Directus will:
  // 1. Redirect to the OAuth provider (Google, Discord, etc.)
  // 2. User authenticates
  // 3. Provider redirects back to Directus with auth code
  // 4. Directus exchanges code for tokens
  // 5. Directus redirects to /auth/callback with tokens in URL or cookies
  // Directus v11 OAuth endpoint format: /auth/login/{provider}?redirect={url}
  // IMPORTANT: AUTH_GOOGLE_MODE=session means tokens go into httpOnly cookies on the
  // Directus domain, NOT as URL params. The callback must go to the frontend where
  // client-side JS can call Directus /users/me with credentials:include to retrieve the session.
  let callbackOrigin = url.origin;
  if (feOrigin) {
    try {
      callbackOrigin = new URL(feOrigin).origin;
    } catch {
      // Ignore invalid feOrigin and fallback to API origin
    }
  }

  const callbackUrl = new URL('/auth/callback', callbackOrigin);
  const directusOAuthUrl = new URL(`/auth/login/${encodeURIComponent(provider)}`, DIRECTUS_URL);
  // Force JSON token mode so cross-site frontends don't depend on Directus cookies.
  directusOAuthUrl.searchParams.set('mode', 'json');
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
  if (feOriginCookie) {
    headers.append('Set-Cookie', feOriginCookie);
  }
  // Clear stale Directus host cookies before starting a new OAuth session.
  headers.append('Set-Cookie', `directus_session_token=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`);
  headers.append('Set-Cookie', `directus_refresh_token=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`);
  headers.append('Set-Cookie', `directus_refresh_token=; Path=/auth/refresh; SameSite=Lax; Max-Age=0${secureFlag}`);

  return new Response(null, {
    status: 302,
    headers
  });
}
