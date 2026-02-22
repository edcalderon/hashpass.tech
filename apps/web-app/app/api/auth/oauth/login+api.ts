import { ExpoResponse } from 'expo-router/server';

const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';
const DEFAULT_RETURN_TO = '/dashboard/explore';
const DEFAULT_FRONTEND_ORIGIN =
  process.env.EXPO_PUBLIC_FRONTEND_URL ||
  process.env.FRONTEND_URL ||
  '';
const OAUTH_FRONTEND_ORIGIN_COOKIE_NAME = 'oauth_frontend_origin';

type OAuthReturnCookiePayload = {
  returnTo: string;
  frontendOrigin: string;
};

function extractOrigin(rawValue: string | null): string | null {
  if (!rawValue) return null;

  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function resolveFrontendOrigin(request: Request, fallbackOrigin: string): string {
  const refererOrigin = extractOrigin(request.headers.get('referer'));
  if (refererOrigin) return refererOrigin;

  const originHeader = extractOrigin(request.headers.get('origin'));
  if (originHeader) return originHeader;

  const configuredOrigin = extractOrigin(DEFAULT_FRONTEND_ORIGIN);
  if (configuredOrigin) return configuredOrigin;

  return fallbackOrigin;
}

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
  const configuredGoogleMode = (process.env.AUTH_GOOGLE_MODE || '').toLowerCase();
  const frontendOrigin = resolveFrontendOrigin(request, url.origin);

  console.log('[OAuth Login] Starting OAuth flow via Directus');
  console.log('[OAuth Login] Provider:', provider);
  console.log('[OAuth Login] Return to:', returnTo);
  console.log('[OAuth Login] Frontend origin:', frontendOrigin);

  // Validate provider - only use Directus-configured providers
  const validProviders = ['google', 'discord', 'github'];
  if (!validProviders.includes(provider)) {
    console.error('[OAuth Login] Invalid provider:', provider);
    const errorUrl = new URL('/auth', frontendOrigin);
    errorUrl.searchParams.set('error', 'invalid_provider');
    errorUrl.searchParams.set('message', `Provider '${provider}' is not supported`);

    return new ExpoResponse(null, {
      status: 302,
      headers: { 'Location': errorUrl.toString() }
    });
  }

  const isHttps = url.protocol === 'https:';
  const secureFlag = isHttps ? '; Secure' : '';

  // Store return URL + frontend origin together in one cookie.
  // Some deployments only preserve a single Set-Cookie header.
  const returnCookiePayload: OAuthReturnCookiePayload = {
    returnTo,
    frontendOrigin,
  };
  const cookieValue = encodeURIComponent(JSON.stringify(returnCookiePayload));
  const setCookieHeader = `oauth_return_to=${cookieValue}; Path=/; SameSite=Lax; Max-Age=3600${secureFlag}`;
  const setFrontendOriginCookieHeader =
    `${OAUTH_FRONTEND_ORIGIN_COOKIE_NAME}=${encodeURIComponent(frontendOrigin)}; ` +
    `Path=/; SameSite=Lax; Max-Age=3600${secureFlag}`;

  // Redirect to Directus OAuth endpoint
  // Directus will:
  // 1. Redirect to the OAuth provider (Google, Discord, etc.)
  // 2. User authenticates
  // 3. Provider redirects back to Directus with auth code
  // 4. Directus exchanges code for tokens
  // 5. Directus redirects to /auth/callback with tokens in URL or cookies
  // Redirect to Directus OAuth endpoint
  // Directus will process OAuth and redirect to /auth/callback
  // We specify only the path, as returnTo is stored in the oauth_return_to cookie
  const callbackUrl = new URL('/api/auth/oauth/callback', url.origin);
  const directusOAuthUrl = new URL(`/auth/login/${encodeURIComponent(provider)}`, DIRECTUS_URL);
  directusOAuthUrl.searchParams.set('redirect', callbackUrl.toString());
  const isLocalHttp =
    url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

  const oauthMode =
    provider === 'google'
      ? (
          isLocalHttp
            ? 'session'
            : configuredGoogleMode === 'session' || configuredGoogleMode === 'json'
              ? configuredGoogleMode
              : 'json'
        )
      : 'json';

  // For localhost over HTTP, force session mode to avoid secure refresh-cookie issues.
  directusOAuthUrl.searchParams.set('mode', oauthMode);
  /* if (provider === 'google') {
    // Force a fresh provider consent flow to avoid reusing stale Directus admin/browser sessions.
    directusOAuthUrl.searchParams.set('prompt', 'consent');
  } */

  console.log('[OAuth Login] Redirecting to Directus OAuth:', directusOAuthUrl.toString());

  const headers = new Headers();
  headers.set('Location', directusOAuthUrl.toString());
  headers.set('Cache-Control', 'no-store');
  headers.append('Set-Cookie', setCookieHeader);
  headers.append('Set-Cookie', setFrontendOriginCookieHeader);
  // Clear stale Directus host cookies before starting a new OAuth session.
  headers.append('Set-Cookie', `directus_session_token=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`);
  headers.append('Set-Cookie', `directus_refresh_token=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`);
  headers.append('Set-Cookie', `directus_refresh_token=; Path=/auth/refresh; SameSite=Lax; Max-Age=0${secureFlag}`);

  return new ExpoResponse(null, {
    status: 302,
    headers
  });
}
