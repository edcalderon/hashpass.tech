import { ExpoResponse } from 'expo-router/server';
import { jwtVerify } from 'jose';

// Support both local and production Directus URLs
const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';
const DIRECTUS_SECRET = process.env.DIRECTUS_SECRET || '';
const DIRECTUS_SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'directus_session_token';
const DIRECTUS_REFRESH_COOKIE_NAME = process.env.REFRESH_TOKEN_COOKIE_NAME || 'directus_refresh_token';

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

const hasCookie = (cookieHeader: string, cookieName: string): boolean =>
  getCookieValue(cookieHeader, cookieName) !== null;

const buildRedirectWithFragment = (
  origin: string,
  returnTo: string,
  fragmentParams: URLSearchParams
): string => {
  const redirectUrl = new URL(returnTo, origin);
  return `${redirectUrl.pathname}${redirectUrl.search}#${fragmentParams.toString()}`;
};

const buildAppCallbackUrl = (origin: string, returnTo: string): string => {
  const appCallbackUrl = new URL('/auth/callback', origin);
  appCallbackUrl.searchParams.set('returnTo', returnTo);
  return appCallbackUrl.toString();
};

const exchangeSessionCookieForJsonTokens = async (
  cookieHeader: string
): Promise<{ access_token?: string; refresh_token?: string } | null> => {
  if (!DIRECTUS_SECRET) {
    return null;
  }

  const sessionJwt = getCookieValue(cookieHeader, DIRECTUS_SESSION_COOKIE_NAME);
  if (!sessionJwt) {
    return null;
  }

  let refreshSessionToken: string | null = null;
  try {
    const secret = new TextEncoder().encode(DIRECTUS_SECRET);
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
  const returnTo = url.searchParams.get('returnTo') || '/dashboard/explore';
  let failureReason = 'No Directus session was returned after OAuth callback.';

  // Get returnTo from cookie if not in URL (set by login endpoint)
  const cookies = request.headers.get('Cookie') || '';
  const returnToCookie = cookies.split(';').find(c => c.trim().startsWith('oauth_return_to='));
  const finalReturnTo = returnToCookie
    ? decodeURIComponent(returnToCookie.split('=')[1])
    : returnTo;
  const hasRefreshTokenCookie = hasCookie(cookies, DIRECTUS_REFRESH_COOKIE_NAME);
  const hasSessionTokenCookie = hasCookie(cookies, DIRECTUS_SESSION_COOKIE_NAME);

  console.log('[OAuth Callback] Processing callback from Directus');
  console.log('[OAuth Callback] Return to:', finalReturnTo);
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
    // Redirect with tokens in URL fragment so client can store them
    const fragment = new URLSearchParams({
      access_token: urlAccessToken,
      ...(urlRefreshToken && { refresh_token: urlRefreshToken })
    });

    return new ExpoResponse(null, {
      status: 302,
      headers: {
        'Location': buildRedirectWithFragment(url.origin, finalReturnTo, fragment),
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
            const fragment = new URLSearchParams({
              access_token: tokens.access_token,
              ...(tokens.refresh_token && { refresh_token: tokens.refresh_token })
            });

            return new ExpoResponse(null, {
              status: 302,
              headers: {
                'Location': buildRedirectWithFragment(url.origin, finalReturnTo, fragment),
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
                'Location': buildAppCallbackUrl(url.origin, finalReturnTo),
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
        const fragment = new URLSearchParams({
          access_token: exchangedTokens.access_token,
          ...(exchangedTokens.refresh_token && { refresh_token: exchangedTokens.refresh_token })
        });

        return new ExpoResponse(null, {
          status: 302,
          headers: {
            'Location': buildRedirectWithFragment(url.origin, finalReturnTo, fragment),
            'Cache-Control': 'no-store',
          },
        });
      }

      // Fallback to client-side session completion when token exchange is unavailable.
      console.log('[OAuth Callback] Session cookie detected; handing off to /auth/callback for client completion.');
      return new ExpoResponse(null, {
        status: 302,
        headers: {
          'Location': buildAppCallbackUrl(url.origin, finalReturnTo),
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
          'Location': buildAppCallbackUrl(url.origin, finalReturnTo),
          'Cache-Control': 'no-store',
        },
      });
    }
  }

  // Failed - redirect to auth page with error  
  console.error('[OAuth Callback] ❌ Failed to obtain tokens from Directus');
  const errorUrl = new URL('/auth', url.origin);
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
