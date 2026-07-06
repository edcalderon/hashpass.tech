import { ExpoResponse } from 'expo-router/server';
import { syncPublicUserRegistry } from '../../../../lib/auth/public-user-registry';

/* eslint-disable no-restricted-syntax -- Server-side OAuth callback must call Google and Directus directly. */

const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const DEFAULT_RETURN_TO = '/dashboard/explore';
const DEFAULT_FRONTEND_ORIGIN =
  process.env.EXPO_PUBLIC_FRONTEND_URL ||
  process.env.FRONTEND_URL ||
  '';
const OAUTH_STATE_COOKIE_NAME = 'oauth_google_state';
const OAUTH_NATIVE_CALLBACK_COOKIE_NAME = 'oauth_native_callback';
const TRUSTED_FRONTEND_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'hashpass.tech',
  'hashpass.co',
  'hashpass.lat',
]);
const TRUSTED_FRONTEND_SUFFIXES = [
  '.hashpass.tech',
  '.hashpass.co',
  '.hashpass.lat',
];
const LOCAL_ORIGINS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

const isLocalDevRuntime = (): boolean => {
  const env = String(process.env.EXPO_PUBLIC_ENV || process.env.NODE_ENV || '').toLowerCase();
  return ['local', 'development', 'dev', 'staging'].includes(env);
};

type OAuthReturnCookiePayload = {
  returnTo?: string;
  frontendOrigin?: string;
};

const normalizeReturnToPath = (value: string | null | undefined): string => {
  let normalized = value || DEFAULT_RETURN_TO;

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep original value if decoding fails.
  }

  if (!normalized.startsWith('/')) {
    return DEFAULT_RETURN_TO;
  }

  normalized = normalized.replace(/\/\([^/]+\)/g, '');

  if (!normalized || normalized === '/auth' || normalized.includes('/auth/callback')) {
    return DEFAULT_RETURN_TO;
  }

  return normalized;
};

const getCookieValue = (cookieHeader: string, cookieName: string): string | null => {
  const prefix = `${cookieName}=`;
  const match = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));

  if (!match) return null;

  const rawValue = match.substring(prefix.length);

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
};

const parseOAuthReturnCookie = (rawCookieValue: string | null): OAuthReturnCookiePayload => {
  if (!rawCookieValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawCookieValue);
    if (parsed && typeof parsed === 'object') {
      const payload: OAuthReturnCookiePayload = {};
      if (typeof parsed.returnTo === 'string') payload.returnTo = parsed.returnTo;
      if (typeof parsed.frontendOrigin === 'string') payload.frontendOrigin = parsed.frontendOrigin;
      return payload;
    }
  } catch {
    // Backward compatibility: old cookie value was just returnTo path.
  }

  return { returnTo: rawCookieValue };
};

const extractOrigin = (rawValue: string | null): string | null => {
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
};

const isTrustedFrontendOrigin = (origin: string): boolean => {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    if (isLocalDevRuntime()) {
      return LOCAL_ORIGINS.has(hostname) || hostname.endsWith('.local');
    }

    if (TRUSTED_FRONTEND_HOSTS.has(hostname)) return true;
    return TRUSTED_FRONTEND_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
};

const resolveFrontendOrigin = (
  request: Request,
  returnCookieFrontendOrigin: string | undefined,
  fallbackOrigin: string
): string => {
  const cookiePayloadOrigin = extractOrigin(returnCookieFrontendOrigin || null);
  if (cookiePayloadOrigin && isTrustedFrontendOrigin(cookiePayloadOrigin)) return cookiePayloadOrigin;

  const configuredOrigin = extractOrigin(DEFAULT_FRONTEND_ORIGIN);
  if (configuredOrigin && isTrustedFrontendOrigin(configuredOrigin)) return configuredOrigin;

  const refererOrigin = extractOrigin(request.headers.get('referer'));
  if (refererOrigin && isTrustedFrontendOrigin(refererOrigin)) return refererOrigin;

  const originHeader = extractOrigin(request.headers.get('origin'));
  if (originHeader && isTrustedFrontendOrigin(originHeader)) return originHeader;

  return fallbackOrigin;
};

const createRandomPassword = (): string => {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
};

/**
 * Direct Google OAuth handler
 * This endpoint receives the authorization code from Google and exchanges it for tokens
 * Route: /auth/oauth/google?code=...&state=...
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = request.headers.get('Cookie') || request.headers.get('cookie') || '';
  const returnCookie = parseOAuthReturnCookie(getCookieValue(cookies, 'oauth_return_to'));
  const returnTo = normalizeReturnToPath(returnCookie.returnTo);
  const frontendOrigin = resolveFrontendOrigin(request, returnCookie.frontendOrigin, url.origin);
  const expectedState = getCookieValue(cookies, OAUTH_STATE_COOKIE_NAME);

  // Extract native_callback from the state parameter first — this is the reliable path
  // because Google preserves state across the OAuth round-trip regardless of cookie
  // handling. Fall back to the cookie for older clients that didn't embed it in state.
  let nativeCallback: string | null = null;
  if (state && state.includes('|nc=')) {
    try {
      nativeCallback = decodeURIComponent(state.substring(state.indexOf('|nc=') + 4));
    } catch {
      nativeCallback = null;
    }
  }
  if (!nativeCallback) {
    nativeCallback = getCookieValue(cookies, OAUTH_NATIVE_CALLBACK_COOKIE_NAME);
  }

  console.log('[Google OAuth] Received callback from Google');
  console.log('[Google OAuth] Code:', code ? code.substring(0, 20) + '...' : 'MISSING');
  console.log('[Google OAuth] State:', state ? state.substring(0, 20) + '...' : 'MISSING');
  console.log('[Google OAuth] Native callback:', nativeCallback || '(none — web flow)');
  console.log('[Google OAuth] Return to:', returnTo);
  console.log('[Google OAuth] Frontend origin:', frontendOrigin);

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    const errorUrl = new URL(returnTo, frontendOrigin);
    errorUrl.searchParams.set('error', 'oauth_failed');
    errorUrl.searchParams.set('message', 'Google OAuth client credentials are not configured.');
    return new ExpoResponse(null, {
      status: 302,
      headers: { 'Location': errorUrl.toString(), 'Cache-Control': 'no-store' }
    });
  }

  // Compare state values — both the stored cookie and the returned state may include |nc=...
  const stateBase = state ? state.split('|nc=')[0] : '';
  const expectedStateBase = expectedState ? expectedState.split('|nc=')[0] : '';
  if (expectedState && stateBase !== expectedStateBase) {
    console.error('[Google OAuth] State mismatch.');
    const errorUrl = new URL(returnTo, frontendOrigin);
    errorUrl.searchParams.set('error', 'oauth_failed');
    errorUrl.searchParams.set('message', 'OAuth state validation failed');
    return new ExpoResponse(null, {
      status: 302,
      headers: { 'Location': errorUrl.toString(), 'Cache-Control': 'no-store' }
    });
  }
  
  if (!code) {
    const error = url.searchParams.get('error');
    console.error('[Google OAuth] Google returned error:', error);
    const errorUrl = new URL(returnTo, frontendOrigin);
    errorUrl.searchParams.set('error', error || 'access_denied');
    errorUrl.searchParams.set('message', 'Google authentication was denied or failed');
    
    return new ExpoResponse(null, {
      status: 302,
      headers: { 'Location': errorUrl.toString() }
    });
  }
  
  try {
    // Step 1: Exchange code with Google for tokens
    console.log('[Google OAuth] Exchanging code with Google...');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: GOOGLE_CLIENT_ID || '',
        client_secret: GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${url.origin}/api/auth/oauth/google`,
        grant_type: 'authorization_code'
      }).toString()
    });
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Google OAuth] Google token exchange failed:', tokenResponse.status, errorData);
      throw new Error(`Google token exchange failed: ${tokenResponse.status}`);
    }
    
    const googleTokens = await tokenResponse.json();
    const googleAccessToken = googleTokens.access_token;
    console.log('[Google OAuth] Got access token from Google');
    
    // Step 2: Get user info from Google
    console.log('[Google OAuth] Fetching user profile from Google...');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });
    
    if (!profileResponse.ok) {
      throw new Error(`Failed to get user profile from Google: ${profileResponse.status}`);
    }
    
    const userProfile = await profileResponse.json();
    const userEmail = userProfile.email;
    const userName = userProfile.name || userProfile.email?.split('@')[0];
    const userFirstName =
      userProfile.given_name ||
      userName?.split(' ')?.[0] ||
      userName ||
      null;
    const userLastName =
      userProfile.family_name ||
      userName?.split(' ')?.slice(1).join(' ') ||
      null;
    console.log('[Google OAuth] User email from Google:', userEmail);
    console.log('[Google OAuth] User name from Google:', userName);
    
    // Step 3: Get admin token to create/update user in Directus
    console.log('[Google OAuth] Getting admin token for Directus...');
    const adminLoginResponse = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL || 'admin@hashpass.tech',
        password: process.env.ADMIN_PASSWORD || ''
      })
    });
    
    if (!adminLoginResponse.ok) {
      const adminError = await adminLoginResponse.text();
      console.error('[Google OAuth] Failed to get admin token:', adminLoginResponse.status, adminError.substring(0, 200));
      throw new Error('Failed to authenticate as admin');
    }
    
    const adminAuth = await adminLoginResponse.json();
    const adminToken = adminAuth.data?.access_token;
    
    if (!adminToken) {
      throw new Error('No admin token received');
    }
    
    console.log('[Google OAuth] Got admin token, creating/checking user...');
    
    // Now use admin token to check/create user
    try {
      // First, check if user exists
      const userCheckResponse = await fetch(
        `${DIRECTUS_URL}/users?filter[email][_eq]=${encodeURIComponent(userEmail)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('[Google OAuth] User check response:', userCheckResponse.status);
      
      let userId: string | undefined;
      
      if (userCheckResponse.ok) {
        const userData = await userCheckResponse.json();
        if (userData.data && userData.data.length > 0) {
          userId = userData.data[0].id;
          console.log('[Google OAuth] User exists:', userId);
        }
      }
      
      // If user doesn't exist, create them
      if (!userId) {
        console.log('[Google OAuth] Creating new user in Directus...');
        const createUserResponse = await fetch(`${DIRECTUS_URL}/users`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: userEmail,
            first_name: userName,
            role: process.env.DEFAULT_ROLE_ID,
            status: 'active',
            provider: 'default',
            external_identifier: userProfile.sub || userEmail
          })
        });
        
        console.log('[Google OAuth] User creation response:', createUserResponse.status);
        
        if (createUserResponse.ok) {
          const newUser = await createUserResponse.json();
          userId = newUser.data?.id;
          console.log('[Google OAuth] User created:', userId);
        } else {
          const errorText = await createUserResponse.text();
          console.error('[Google OAuth] Failed to create user:', errorText.substring(0, 200));
          throw new Error('Failed to create user');
        }
      }

      if (userId) {
        await syncPublicUserRegistry(request, {
          provider: 'google',
          authUserId: userId,
          email: userEmail,
          firstName: userFirstName,
          lastName: userLastName,
          fullName: userName || undefined,
          avatarUrl: userProfile.picture || undefined,
          status: 'active',
          authMetadata: {
            auth_provider: 'google',
            directus_user_id: userId,
            google_sub: userProfile.sub,
          },
          profileMetadata: {
            google_profile: userProfile,
            directus_user_id: userId,
          },
          providerIds: {
            google: userProfile.sub,
            directus: userId,
          },
        });

        console.log('[Google OAuth] Ensuring Directus user can receive API-issued tokens...');
        const normalizeUserResponse = await fetch(`${DIRECTUS_URL}/users/${userId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            provider: 'default',
            external_identifier: userProfile.sub || userEmail,
            status: 'active',
            ...(process.env.DEFAULT_ROLE_ID && { role: process.env.DEFAULT_ROLE_ID })
          })
        });

        console.log('[Google OAuth] User normalization response:', normalizeUserResponse.status);
      }
      
      // Now get a token for this user by setting a temporary password and authenticating
      console.log('[Google OAuth] Generating temporary password for OAuth user...');
      
      // Generate a random temporary password
      const tempPassword = createRandomPassword();
      
      // Update user with temporary password using admin token
      const updateUserResponse = await fetch(`${DIRECTUS_URL}/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password: tempPassword
        })
      });
      
      console.log('[Google OAuth] User password update response:', updateUserResponse.status);
      
      if (!updateUserResponse.ok) {
        const errorText = await updateUserResponse.text();
        console.error('[Google OAuth] Failed to set temp password:', errorText.substring(0, 200));
        throw new Error('Failed to set temporary password');
      }
      
      // Now authenticate as the user using email and temporary password
      console.log('[Google OAuth] Getting token for OAuth user...');
      
      const userTokenResponse = await fetch(`${DIRECTUS_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          password: tempPassword
        })
      });
      
      console.log('[Google OAuth] User token response:', userTokenResponse.status);
      
      if (userTokenResponse.ok) {
        const tokenData = await userTokenResponse.json();
        const tokens = tokenData.data || tokenData;
        
        if (tokens.access_token) {
          console.log('[Google OAuth] ✅ Got tokens for OAuth user');
          console.log('[Google OAuth] Access token:', tokens.access_token.substring(0, 20) + '...');
          console.log('[Google OAuth] Redirecting to:', returnTo);
          
          let finalUrl: string;

          if (nativeCallback) {
            // Native app flow: DON'T redirect to hashpass:// directly from the server.
            // Chrome Custom Tabs on Android does not reliably intercept server-sent
            // 302s to custom schemes. Instead, redirect to the web /auth/callback page
            // with nativeRelay=1. That page calls window.location.replace('hashpass://...')
            // which Chrome Custom Tabs handles as a proper Android intent, triggering
            // WebBrowser.openAuthSessionAsync to close and return the URL to the app.
            const webOrigin =
              (isLocalDevRuntime()
                ? 'http://localhost:8081'
                : DEFAULT_FRONTEND_ORIGIN) ||
              (isTrustedFrontendOrigin(frontendOrigin) ? frontendOrigin : '') ||
              (isLocalDevRuntime() ? 'http://localhost:8081' : 'https://hashpass.tech');
            const webCallbackUrl = new URL('/auth/callback', webOrigin);
            webCallbackUrl.searchParams.set('access_token', tokens.access_token);
            if (tokens.refresh_token) webCallbackUrl.searchParams.set('refresh_token', tokens.refresh_token);
            webCallbackUrl.searchParams.set('email', userEmail);
            webCallbackUrl.searchParams.set('nativeRelay', '1');
            finalUrl = webCallbackUrl.toString();
          } else {
            // Web flow: tokens in URL fragment to avoid logging in server access logs.
            const redirectUrl = new URL(returnTo, frontendOrigin);
            const fragment = new URLSearchParams({
              access_token: tokens.access_token,
              ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
              email: userEmail
            });
            finalUrl = `${redirectUrl.toString().split('#')[0]}#${fragment.toString()}`;
          }

          console.log('[Google OAuth] Final redirect URL:', finalUrl.substring(0, 100) + '...');

          const headers = new Headers();
          headers.set('Location', finalUrl);
          headers.set('Cache-Control', 'no-store');
          headers.append('Set-Cookie', 'oauth_return_to=; Path=/; Max-Age=0');
          headers.append('Set-Cookie', `${OAUTH_STATE_COOKIE_NAME}=; Path=/; Max-Age=0`);
          headers.append('Set-Cookie', `${OAUTH_NATIVE_CALLBACK_COOKIE_NAME}=; Path=/; Max-Age=0`);

          return new ExpoResponse(null, {
            status: 302,
            headers
          });
        }
      } else {
        const errorText = await userTokenResponse.text();
        console.error('[Google OAuth] Failed to get user token:', userTokenResponse.status, errorText.substring(0, 200));
      }
    } catch (dirError) {
      console.error('[Google OAuth] Directus operation failed:', dirError instanceof Error ? dirError.message : String(dirError));
    }
    
    // If we get here, something went wrong
    throw new Error('Failed to authenticate user in Directus after Google OAuth');
    
  } catch (error) {
    console.error('[Google OAuth] ❌ Error:', error instanceof Error ? error.message : String(error));
    
    const errorUrl = new URL(returnTo, frontendOrigin);
    errorUrl.searchParams.set('error', 'oauth_failed');
    errorUrl.searchParams.set('message', error instanceof Error ? error.message : 'OAuth authentication failed');
    
    return new ExpoResponse(null, {
      status: 302,
      headers: {
        'Location': errorUrl.toString(),
        'Cache-Control': 'no-store'
      }
    });
  }
}
