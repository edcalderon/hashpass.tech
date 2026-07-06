import { ExpoResponse } from 'expo-router/server';
import { resolveGoogleOAuthClientId } from '../../../../lib/auth/oauth/google-credentials';

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
const OAUTH_STATE_COOKIE_NAME = 'oauth_google_state';
const OAUTH_NATIVE_CALLBACK_COOKIE_NAME = 'oauth_native_callback';
const LOCAL_ORIGINS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

function isLocalDevRuntime(): boolean {
  const env = String(process.env.EXPO_PUBLIC_ENV || process.env.NODE_ENV || '').toLowerCase();
  return ['local', 'development', 'dev', 'staging'].includes(env);
}

type OAuthReturnCookiePayload = {
  returnTo: string;
  frontendOrigin: string;
};

function normalizeHostname(rawValue: string): string {
  return rawValue.trim().toLowerCase();
}

function getDirectusHostname(rawUrl: string): string {
  try {
    return normalizeHostname(new URL(rawUrl).hostname);
  } catch {
    return '';
  }
}

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

function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return LOCAL_ORIGINS.has(hostname) || hostname.endsWith('.local');
  } catch {
    return false;
  }
}

function resolveFrontendOrigin(request: Request, fallbackOrigin: string): string {
  const allowRemoteOrigins = !isLocalDevRuntime();

  const refererOrigin = extractOrigin(request.headers.get('referer'));
  if (refererOrigin && (allowRemoteOrigins || isLocalOrigin(refererOrigin))) return refererOrigin;

  const originHeader = extractOrigin(request.headers.get('origin'));
  if (originHeader && (allowRemoteOrigins || isLocalOrigin(originHeader))) return originHeader;

  const configuredOrigin = extractOrigin(DEFAULT_FRONTEND_ORIGIN);
  if (configuredOrigin && (allowRemoteOrigins || isLocalOrigin(configuredOrigin))) return configuredOrigin;

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

function createOAuthState(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
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
  const nativeCallback = url.searchParams.get('native_callback') || '';
  const frontendOrigin = resolveFrontendOrigin(request, url.origin);
  const frontendHostname = normalizeHostname(url.hostname);
  const directusHostname = getDirectusHostname(DIRECTUS_URL);
  const GOOGLE_CLIENT_ID = resolveGoogleOAuthClientId();

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

  const callbackUrl = new URL('/api/auth/oauth/callback', url.origin);

  if (provider === 'google' && GOOGLE_CLIENT_ID) {
    const stateBase = createOAuthState();
    // Encode native_callback inside state so Google preserves it across the round-trip.
    // Cookies from api.hashpass.tech are often stripped by API Gateway on 302 responses,
    // so the state parameter is the only reliable carrier for this value.
    const fullState = nativeCallback
      ? `${stateBase}|nc=${encodeURIComponent(nativeCallback)}`
      : stateBase;
    const googleCallbackUrl = new URL('/api/auth/oauth/google', url.origin);
    const googleOAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleOAuthUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    googleOAuthUrl.searchParams.set('redirect_uri', googleCallbackUrl.toString());
    googleOAuthUrl.searchParams.set('response_type', 'code');
    googleOAuthUrl.searchParams.set('scope', 'openid profile email');
    googleOAuthUrl.searchParams.set('access_type', 'offline');
    googleOAuthUrl.searchParams.set('prompt', 'select_account');
    googleOAuthUrl.searchParams.set('state', fullState);

    console.log('[OAuth Login] Redirecting to Google OAuth through API callback:', googleOAuthUrl.toString());

    const headers = new Headers();
    headers.set('Location', googleOAuthUrl.toString());
    headers.set('Cache-Control', 'no-store');
    headers.append('Set-Cookie', setCookieHeader);
    headers.append('Set-Cookie', setFrontendOriginCookieHeader);
    headers.append('Set-Cookie', `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(fullState)}; Path=/; SameSite=Lax; Max-Age=600${secureFlag}`);
    if (nativeCallback) {
      headers.append('Set-Cookie', `${OAUTH_NATIVE_CALLBACK_COOKIE_NAME}=${encodeURIComponent(nativeCallback)}; Path=/; SameSite=Lax; Max-Age=600${secureFlag}`);
    }

    return new ExpoResponse(null, {
      status: 302,
      headers,
    });
  }

  const directusOAuthUrl = new URL(`/auth/login/${encodeURIComponent(provider)}`, DIRECTUS_URL);
  directusOAuthUrl.searchParams.set('redirect', callbackUrl.toString());
  const isLocalHttp =
    url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

  // Directus SSO docs recommend session-based redirects for browser OAuth flows.
  // The callback route can handle the resulting session cookie or no-cookie fallback.
  directusOAuthUrl.searchParams.set('mode', 'session');
  /* if (provider === 'google') {
    // Force a fresh provider consent flow to avoid reusing stale Directus admin/browser sessions.
    directusOAuthUrl.searchParams.set('prompt', 'consent');
  } */

  console.log('[OAuth Login] Redirecting to Directus OAuth:', directusOAuthUrl.toString());
  console.log('[OAuth Login] Selected mode: session', {
    frontendHostname,
    directusHostname,
    isLocalHttp,
  });

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
