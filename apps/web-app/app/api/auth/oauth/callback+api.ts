import { ExpoResponse } from 'expo-router/server';
import { jwtVerify } from 'jose';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Support both local and production Directus URLs
const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';
const directusSecret =
  process.env['DIRECTUS_SECRET'] ||
  '';
const DIRECTUS_SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'directus_session_token';
const DIRECTUS_REFRESH_COOKIE_NAME = process.env.REFRESH_TOKEN_COOKIE_NAME || 'directus_refresh_token';
const OAUTH_FRONTEND_ORIGIN_COOKIE_NAME = 'oauth_frontend_origin';
const DEFAULT_FRONTEND_ORIGIN =
  process.env.EXPO_PUBLIC_FRONTEND_URL ||
  process.env.FRONTEND_URL ||
  '';
const supabaseUrl =
  process.env['EXPO_PUBLIC_SUPABASE_URL'] ||
  '';
const supabaseServiceRoleKey =
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
  '';
const DIRECTUS_OAUTH_SUPABASE_SYNC_ENABLED =
  (process.env.DIRECTUS_OAUTH_SUPABASE_SYNC_ENABLED || 'true').toLowerCase() !== 'false';
const DIRECTUS_OAUTH_SUPABASE_BRIDGE_ENABLED =
  (process.env.DIRECTUS_OAUTH_SUPABASE_BRIDGE_ENABLED || 'true').toLowerCase() !== 'false';

type DirectusOAuthUser = {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
};

type SupabaseSessionBridge = {
  token_hash: string;
  type: string;
  email: string;
};

type DirectusSupabaseSyncResult = {
  email: string;
  bridge: SupabaseSessionBridge | null;
};

let supabaseAdminClient: SupabaseClient | null = null;

const normalizeEmail = (value: string | null | undefined): string => value?.trim().toLowerCase() || '';
const DEFAULT_RETURN_TO = '/dashboard/explore';

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

const getSupabaseAdminClient = (): SupabaseClient | null => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdminClient;
};

const isDuplicateSupabaseUserError = (errorMessage: string): boolean =>
  /already registered|already exists|duplicate key|email.*exists/i.test(errorMessage);

const findSupabaseUserByEmail = async (client: SupabaseClient, email: string) => {
  const targetEmail = normalizeEmail(email);
  const perPage = 200;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn('[OAuth Callback] Supabase listUsers failed while searching by email:', error.message);
      return null;
    }

    const users = data?.users || [];
    const match = users.find((user) => normalizeEmail(user.email) === targetEmail);
    if (match) {
      return match;
    }

    if (users.length < perPage) {
      break;
    }
  }

  return null;
};

const issueSupabaseSessionBridge = async (
  client: SupabaseClient,
  email: string
): Promise<SupabaseSessionBridge | null> => {
  if (!DIRECTUS_OAUTH_SUPABASE_BRIDGE_ENABLED) {
    return null;
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  try {
    const { data, error } = await client.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    });

    if (error) {
      console.warn('[OAuth Callback] Could not issue Supabase bridge link:', error.message);
      return null;
    }

    const rawType =
      typeof data?.properties?.verification_type === 'string' && data.properties.verification_type.trim()
        ? data.properties.verification_type.trim()
        : 'magiclink';

    let tokenHash =
      typeof data?.properties?.hashed_token === 'string'
        ? data.properties.hashed_token.trim()
        : '';

    if (!tokenHash && data?.properties?.action_link) {
      try {
        const actionUrl = new URL(data.properties.action_link);
        tokenHash =
          actionUrl.searchParams.get('token_hash') ||
          actionUrl.searchParams.get('token') ||
          '';
      } catch {
        // Keep empty token hash and fail gracefully below.
      }
    }

    if (!tokenHash) {
      console.warn('[OAuth Callback] Supabase bridge link generated without token hash.');
      return null;
    }

    return {
      token_hash: tokenHash,
      type: rawType,
      email: normalizedEmail,
    };
  } catch (error) {
    console.warn(
      '[OAuth Callback] Failed to issue Supabase bridge link:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
};

const appendSupabaseBridgeToFragment = (
  fragment: URLSearchParams,
  bridge: SupabaseSessionBridge | null
) => {
  if (!bridge) {
    return;
  }

  fragment.set('sb_token_hash', bridge.token_hash);
  fragment.set('sb_type', bridge.type);
  fragment.set('sb_email', bridge.email);
};

const syncDirectusUserToSupabase = async (
  accessToken: string
): Promise<DirectusSupabaseSyncResult | null> => {
  if (!DIRECTUS_OAUTH_SUPABASE_SYNC_ENABLED) {
    return null;
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    console.warn(
      '[OAuth Callback] Supabase sync skipped: EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.'
    );
    return null;
  }

  try {
    // eslint-disable-next-line no-restricted-syntax
    const directusUserResponse = await fetch(`${DIRECTUS_URL}/users/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!directusUserResponse.ok) {
      const directusBody = await directusUserResponse.text().catch(() => '');
      console.warn(
        '[OAuth Callback] Supabase sync skipped: could not load Directus user from OAuth token.',
        directusBody || `HTTP ${directusUserResponse.status}`
      );
      return null;
    }

    const directusPayload = await directusUserResponse.json().catch(() => ({}));
    const directusUser = ((directusPayload as Record<string, any>).data ||
      directusPayload) as DirectusOAuthUser;
    const email = normalizeEmail(directusUser.email);
    if (!email) {
      console.warn('[OAuth Callback] Supabase sync skipped: Directus OAuth user has no email.');
      return null;
    }

    const fullName = `${directusUser.first_name || ''} ${directusUser.last_name || ''}`.trim();
    const desiredMetadata: Record<string, string> = {
      auth_provider: 'directus_google',
      auth_bridge: 'directus_oauth_callback',
    };

    if (fullName) desiredMetadata.full_name = fullName;
    if (directusUser.first_name) desiredMetadata.first_name = directusUser.first_name;
    if (directusUser.last_name) desiredMetadata.last_name = directusUser.last_name;
    if (directusUser.id) desiredMetadata.directus_user_id = directusUser.id;

    const createResult = await client.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: desiredMetadata,
    });

    if (!createResult.error && createResult.data?.user) {
      console.log('[OAuth Callback] ✅ Synced Directus OAuth user into Supabase:', email);
      const bridge = await issueSupabaseSessionBridge(client, email);
      return { email, bridge };
    }

    const createErrorMessage = createResult.error?.message || '';
    if (!isDuplicateSupabaseUserError(createErrorMessage)) {
      console.warn(
        '[OAuth Callback] Supabase sync createUser failed:',
        createErrorMessage || 'Unknown createUser error'
      );
      return { email, bridge: null };
    }

    const existingUser = await findSupabaseUserByEmail(client, email);
    if (!existingUser) {
      console.warn('[OAuth Callback] Supabase sync: user already exists but could not be located for metadata update.');
      const bridge = await issueSupabaseSessionBridge(client, email);
      return { email, bridge };
    }

    const existingMetadata = (existingUser.user_metadata || {}) as Record<string, any>;
    const mergedMetadata: Record<string, any> = {
      ...existingMetadata,
    };

    if (!mergedMetadata.full_name && desiredMetadata.full_name) mergedMetadata.full_name = desiredMetadata.full_name;
    if (!mergedMetadata.first_name && desiredMetadata.first_name) mergedMetadata.first_name = desiredMetadata.first_name;
    if (!mergedMetadata.last_name && desiredMetadata.last_name) mergedMetadata.last_name = desiredMetadata.last_name;
    if (desiredMetadata.directus_user_id) mergedMetadata.directus_user_id = desiredMetadata.directus_user_id;
    if (!mergedMetadata.auth_provider) mergedMetadata.auth_provider = desiredMetadata.auth_provider;
    mergedMetadata.auth_bridge = desiredMetadata.auth_bridge;

    const updateResult = await client.auth.admin.updateUserById(existingUser.id, {
      email_confirm: true,
      user_metadata: mergedMetadata,
    });

    if (updateResult.error) {
      console.warn(
        '[OAuth Callback] Supabase sync metadata update failed:',
        updateResult.error.message
      );
      const bridge = await issueSupabaseSessionBridge(client, email);
      return { email, bridge };
    }

    console.log('[OAuth Callback] ✅ Updated existing Supabase user with Directus metadata:', email);
    const bridge = await issueSupabaseSessionBridge(client, email);
    return { email, bridge };
  } catch (error) {
    console.warn(
      '[OAuth Callback] Supabase sync failed unexpectedly:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
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

const resolveFrontendOrigin = (
  request: Request,
  cookieHeader: string,
  fallbackOrigin: string
): string => {
  const cookieOrigin = extractOrigin(getCookieValue(cookieHeader, OAUTH_FRONTEND_ORIGIN_COOKIE_NAME));
  if (cookieOrigin) return cookieOrigin;

  const configuredOrigin = extractOrigin(DEFAULT_FRONTEND_ORIGIN);
  if (configuredOrigin) return configuredOrigin;

  const refererOrigin = extractOrigin(request.headers.get('referer'));
  if (refererOrigin) return refererOrigin;

  const originHeader = extractOrigin(request.headers.get('origin'));
  if (originHeader) return originHeader;

  return fallbackOrigin;
};

const hasCookie = (cookieHeader: string, cookieName: string): boolean =>
  getCookieValue(cookieHeader, cookieName) !== null;

const buildRedirectWithFragment = (
  frontendOrigin: string,
  returnTo: string,
  fragmentParams: URLSearchParams
): string => {
  const redirectUrl = new URL(returnTo, frontendOrigin);
  redirectUrl.hash = fragmentParams.toString();
  return redirectUrl.toString();
};

const buildAppCallbackUrl = (frontendOrigin: string, returnTo: string): string => {
  const appCallbackUrl = new URL('/auth/callback', frontendOrigin);
  appCallbackUrl.searchParams.set('returnTo', returnTo);
  return appCallbackUrl.toString();
};

const exchangeSessionCookieForJsonTokens = async (
  cookieHeader: string
): Promise<{ access_token?: string; refresh_token?: string } | null> => {
  if (!directusSecret) {
    return null;
  }

  const sessionJwt = getCookieValue(cookieHeader, DIRECTUS_SESSION_COOKIE_NAME);
  if (!sessionJwt) {
    return null;
  }

  let refreshSessionToken: string | null = null;
  try {
    const secret = new TextEncoder().encode(directusSecret);
    const { payload } = await jwtVerify(sessionJwt, secret, { issuer: 'directus' });
    refreshSessionToken = typeof payload.session === 'string' ? payload.session : null;
  } catch (error) {
    console.warn(
      '[OAuth Callback] Could not decode Directus session JWT for token exchange:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }

  if (!refreshSessionToken) {
    return null;
  }

  try {
    // eslint-disable-next-line no-restricted-syntax
    const refreshResponse = await fetch(`${DIRECTUS_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshSessionToken }),
    });

    if (!refreshResponse.ok) {
      const body = await refreshResponse.text().catch(() => '');
      console.warn(
        '[OAuth Callback] Session-cookie token exchange failed:',
        refreshResponse.status,
        body.slice(0, 180)
      );
      return null;
    }

    const refreshData = await refreshResponse.json().catch(() => ({}));
    const tokens = refreshData?.data || refreshData;

    if (tokens?.access_token) {
      return tokens;
    }
  } catch (error) {
    console.warn(
      '[OAuth Callback] Session-cookie token exchange request failed:',
      error instanceof Error ? error.message : String(error)
    );
  }

  return null;
};

// Fallback callback handler - retrieves tokens from Directus after OAuth
// Flow:
// 1. User clicks "Sign in with Google"
// 2. Browser redirects to /api/auth/oauth/login?provider=google
// 3. That endpoint redirects to Directus /auth/login/google?redirect=...
// 4. Directus redirects to Google OAuth
// 5. User authenticates with Google
// 6. Google redirects back to Directus
// 7. Directus processes OAuth and redirects to /auth/callback
// 8. This endpoint retrieves the tokens and redirects user to dashboard
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = normalizeReturnToPath(url.searchParams.get('returnTo') || DEFAULT_RETURN_TO);
  let failureReason = 'No Directus session was returned after OAuth callback.';

  // Get returnTo from cookie if not in URL (set by login endpoint)
  const cookies = request.headers.get('Cookie') || '';
  const returnToCookie = getCookieValue(cookies, 'oauth_return_to');
  const finalReturnTo = normalizeReturnToPath(returnToCookie || returnTo);
  const frontendOrigin = resolveFrontendOrigin(request, cookies, url.origin);
  const hasRefreshTokenCookie = hasCookie(cookies, DIRECTUS_REFRESH_COOKIE_NAME);
  const hasSessionTokenCookie = hasCookie(cookies, DIRECTUS_SESSION_COOKIE_NAME);

  console.log('[OAuth Callback] Processing callback from Directus');
  console.log('[OAuth Callback] Return to:', finalReturnTo);
  console.log('[OAuth Callback] Frontend origin:', frontendOrigin);
  console.log('[OAuth Callback] Directus URL:', DIRECTUS_URL);

  // Check if we received tokens directly in URL from Directus
  // Some OAuth flows pass tokens in the URL fragment
  const urlAccessToken = url.searchParams.get('access_token');
  const urlRefreshToken = url.searchParams.get('refresh_token');
  const error = url.searchParams.get('error');
  const message = url.searchParams.get('message');

  console.log('[OAuth Callback] Received parameters:', Object.fromEntries(url.searchParams.entries()));

  console.log('[OAuth Callback] Received from Directus:', {
    hasAccessToken: !!urlAccessToken,
    hasRefreshToken: !!urlRefreshToken,
    hasRefreshTokenCookie,
    hasSessionTokenCookie,
    error,
    reason: url.searchParams.get('reason'),
    message,
    fullUrl: url.toString().substring(0, 100) + '...'
  });

  const reason = url.searchParams.get('reason');

  if (urlAccessToken) {
    console.log('[OAuth Callback] ✅ Found tokens in URL');
    const syncResult = await syncDirectusUserToSupabase(urlAccessToken);
    // Redirect with tokens in URL fragment so client can store them
    const fragment = new URLSearchParams({
      access_token: urlAccessToken,
      ...(urlRefreshToken && { refresh_token: urlRefreshToken })
    });
    appendSupabaseBridgeToFragment(fragment, syncResult?.bridge || null);

    return new ExpoResponse(null, {
      status: 302,
      headers: {
        'Location': buildRedirectWithFragment(frontendOrigin, finalReturnTo, fragment),
        'Cache-Control': 'no-store'
      }
    });
  }

  // If Directus returned an error or reason, we should stop here
  if (reason || error) {
    failureReason = message || reason || error || 'Unknown authentication error';
    console.error('[OAuth Callback] ❌ Directus returned error:', failureReason);
  } else if (cookies) {
    if (hasRefreshTokenCookie) {
      console.log('[OAuth Callback] Found refresh cookie, attempting Directus /auth/refresh...');
      try {
        // Try to refresh the session using cookies
        // This validates the OAuth cookie session and returns short-lived tokens.
        // eslint-disable-next-line no-restricted-syntax
        const refreshResponse = await fetch(`${DIRECTUS_URL}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Cookie': cookies,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ mode: 'json' })
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          const tokens = refreshData.data || refreshData;

          if (tokens.access_token) {
            console.log('[OAuth Callback] ✅ Got tokens from refresh endpoint');
            const syncResult = await syncDirectusUserToSupabase(tokens.access_token);
            const fragment = new URLSearchParams({
              access_token: tokens.access_token,
              ...(tokens.refresh_token && { refresh_token: tokens.refresh_token })
            });
            appendSupabaseBridgeToFragment(fragment, syncResult?.bridge || null);

            return new ExpoResponse(null, {
              status: 302,
              headers: {
                'Location': buildRedirectWithFragment(frontendOrigin, finalReturnTo, fragment),
                'Cache-Control': 'no-store'
              }
            });
          }
        } else {
          const errorBody = await refreshResponse.text().catch(() => '');
          const compactBody = errorBody.replace(/\s+/g, ' ').slice(0, 180);

          if (
            refreshResponse.status === 400 &&
            /refresh token is required/i.test(errorBody)
          ) {
            console.warn(
              '[OAuth Callback] Refresh cookie is scoped away from callback route; handing off to client callback for cookie-based completion.'
            );
            return new ExpoResponse(null, {
              status: 302,
              headers: {
                'Location': buildAppCallbackUrl(frontendOrigin, finalReturnTo),
                'Cache-Control': 'no-store',
              },
            });
          } else {
            failureReason = compactBody
              ? `Directus /auth/refresh returned ${refreshResponse.status}: ${compactBody}`
              : `Directus /auth/refresh returned ${refreshResponse.status}.`;
          }
          console.log('[OAuth Callback] Refresh failed:', failureReason);
        }
      } catch (error) {
        failureReason = error instanceof Error ? error.message : String(error);
        console.error('[OAuth Callback] Error during refresh:', error instanceof Error ? error.message : String(error));
      }
    } else if (hasSessionTokenCookie) {
      // Some Directus setups use AUTH_GOOGLE_MODE=session and only provide session cookies.
      // Attempt server-side token exchange to avoid client-side cookie race/cors issues.
      const exchangedTokens = await exchangeSessionCookieForJsonTokens(cookies);
      if (exchangedTokens?.access_token) {
        console.log('[OAuth Callback] ✅ Exchanged session cookie for JSON tokens.');
        const syncResult = await syncDirectusUserToSupabase(exchangedTokens.access_token);
        const fragment = new URLSearchParams({
          access_token: exchangedTokens.access_token,
          ...(exchangedTokens.refresh_token && { refresh_token: exchangedTokens.refresh_token })
        });
        appendSupabaseBridgeToFragment(fragment, syncResult?.bridge || null);

        return new ExpoResponse(null, {
          status: 302,
          headers: {
            'Location': buildRedirectWithFragment(frontendOrigin, finalReturnTo, fragment),
            'Cache-Control': 'no-store',
          },
        });
      }

      // Fallback to client-side session completion when token exchange is unavailable.
      console.log('[OAuth Callback] Session cookie detected; handing off to /auth/callback for client completion.');
      return new ExpoResponse(null, {
        status: 302,
        headers: {
          'Location': buildAppCallbackUrl(frontendOrigin, finalReturnTo),
          'Cache-Control': 'no-store',
        },
      });
    } else {
      // On localhost, refresh cookie can be scoped to /auth/refresh and won't be visible here.
      // Continue client-side so browser can call Directus directly with credentials.
      console.log('[OAuth Callback] No auth cookies visible on callback route, handing off to /auth/callback for client completion.');
      return new ExpoResponse(null, {
        status: 302,
        headers: {
          'Location': buildAppCallbackUrl(frontendOrigin, finalReturnTo),
          'Cache-Control': 'no-store',
        },
      });
    }
  }

  // When Directus returns with hash-based tokens, the server callback cannot read the fragment.
  // Hand off to the frontend callback so client-side auth can finalize the session.
  if (!reason && !error) {
    console.warn('[OAuth Callback] No server-visible tokens/session. Handing off to frontend callback for client-side completion.');
    return new ExpoResponse(null, {
      status: 302,
      headers: {
        'Location': buildAppCallbackUrl(frontendOrigin, finalReturnTo),
        'Cache-Control': 'no-store',
      },
    });
  }

  // Failed - redirect to auth page with error  
  console.error('[OAuth Callback] ❌ Failed to obtain tokens from Directus');
  const errorUrl = new URL('/auth', frontendOrigin);
  errorUrl.searchParams.set('error', 'oauth_failed');
  errorUrl.searchParams.set('message', `Authentication could not be completed. ${failureReason} Redirecting to login.`);

  return new ExpoResponse(null, {
    status: 302,
    headers: {
      'Location': errorUrl.toString(),
      'Cache-Control': 'no-store'
    }
  });
}
