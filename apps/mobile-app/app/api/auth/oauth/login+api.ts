import { ExpoResponse } from 'expo-router/server';
import { resolveFrontendOrigin } from '../../../../lib/auth/oauth/frontend-origin';

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
const OAUTH_NATIVE_CALLBACK_COOKIE_NAME = 'oauth_native_callback';

type OAuthReturnCookiePayload = {
  returnTo: string;
  frontendOrigin: string;
};

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
 * Redirects to Directus OAuth provider for every supported provider.
 * Directus handles the full OAuth flow and redirects back to /api/auth/oauth/callback.
 * Route: /api/auth/oauth/login?provider=google&returnTo=...
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'google';
  const returnTo = normalizeReturnToPath(url.searchParams.get('returnTo') || DEFAULT_RETURN_TO);
  const nativeCallback = url.searchParams.get('native_callback') || '';
  const frontendOrigin = resolveFrontendOrigin({
    request,
    candidates: [
      DEFAULT_FRONTEND_ORIGIN,
      request.headers.get('referer'),
      request.headers.get('origin'),
    ],
    fallbackOrigin: url.origin,
  });

  console.log('[OAuth Login] Starting OAuth flow via Directus');
  console.log('[OAuth Login] Provider:', provider);
  console.log('[OAuth Login] Return to:', returnTo);
  console.log('[OAuth Login] Frontend origin:', frontendOrigin);
  if (nativeCallback) {
    console.log('[OAuth Login] Native callback requested:', nativeCallback);
  }

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

  const returnCookiePayload: OAuthReturnCookiePayload = {
    returnTo,
    frontendOrigin,
  };
  const cookieValue = encodeURIComponent(JSON.stringify(returnCookiePayload));
  const setCookieHeader = `oauth_return_to=${cookieValue}; Path=/; SameSite=Lax; Max-Age=3600${secureFlag}`;
  const setFrontendOriginCookieHeader =
    `${OAUTH_FRONTEND_ORIGIN_COOKIE_NAME}=${encodeURIComponent(frontendOrigin)}; ` +
    `Path=/; SameSite=Lax; Max-Age=3600${secureFlag}`;
  const nativeCallbackCookieHeader = nativeCallback
    ? `${OAUTH_NATIVE_CALLBACK_COOKIE_NAME}=${encodeURIComponent(nativeCallback)}; Path=/; SameSite=Lax; Max-Age=600${secureFlag}`
    : `${OAUTH_NATIVE_CALLBACK_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`;

  const callbackUrl = new URL('/api/auth/oauth/callback', url.origin);
  callbackUrl.searchParams.set('returnTo', returnTo);
  if (nativeCallback) {
    callbackUrl.searchParams.set('native_callback', nativeCallback);
  }
  const directusOAuthUrl = new URL(`/auth/login/${encodeURIComponent(provider)}`, DIRECTUS_URL);
  directusOAuthUrl.searchParams.set('redirect', callbackUrl.toString());
  directusOAuthUrl.searchParams.set('mode', 'session');

  console.log('[OAuth Login] Redirecting to Directus OAuth:', directusOAuthUrl.toString());

  const headers = new Headers();
  headers.set('Location', directusOAuthUrl.toString());
  headers.set('Cache-Control', 'no-store');
  headers.append('Set-Cookie', setCookieHeader);
  headers.append('Set-Cookie', setFrontendOriginCookieHeader);
  headers.append('Set-Cookie', nativeCallbackCookieHeader);
  // Clear stale Directus host cookies before starting a new OAuth session.
  headers.append('Set-Cookie', `directus_session_token=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`);
  headers.append('Set-Cookie', `directus_refresh_token=; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`);
  headers.append('Set-Cookie', `directus_refresh_token=; Path=/auth/refresh; SameSite=Lax; Max-Age=0${secureFlag}`);

  return new ExpoResponse(null, {
    status: 302,
    headers
  });
}
