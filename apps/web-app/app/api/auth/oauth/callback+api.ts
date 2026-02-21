import { ExpoRequest, ExpoResponse } from 'expo-router/server';

// Support both local and production Directus URLs
const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';

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

  console.log('[OAuth Callback] Processing callback from Directus');
  console.log('[OAuth Callback] Return to:', finalReturnTo);
  console.log('[OAuth Callback] Directus URL:', DIRECTUS_URL);

  // Check if we received tokens directly in URL from Directus
  // Some OAuth flows pass tokens in the URL fragment
  const urlAccessToken = url.searchParams.get('access_token');
  const urlRefreshToken = url.searchParams.get('refresh_token');
  const error = url.searchParams.get('error');
  const message = url.searchParams.get('message');

  console.log('[OAuth Callback] Received from Directus:', {
    hasAccessToken: !!urlAccessToken,
    hasRefreshToken: !!urlRefreshToken,
    error,
    message,
    fullUrl: url.toString().substring(0, 100) + '...'
  });

  if (urlAccessToken) {
    console.log('[OAuth Callback] ✅ Found tokens in URL');
    // Redirect with tokens in URL fragment so client can store them
    const redirectUrl = new URL(finalReturnTo, url.origin);
    const fragment = new URLSearchParams({
      access_token: urlAccessToken,
      ...(urlRefreshToken && { refresh_token: urlRefreshToken })
    });

    return new ExpoResponse(null, {
      status: 302,
      headers: {
        'Location': `${redirectUrl.pathname}#${fragment.toString()}`,
        'Cache-Control': 'no-store'
      }
    });
  }

  // Check if we have session cookies from Directus
  // After successful OAuth, Directus sets authentication cookies
  if (cookies) {
    console.log('[OAuth Callback] Found cookies, attempting to refresh session with Directus...');
    try {
      // Try to refresh the session using cookies
      // This will validate the OAuth session and return tokens
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
          const redirectUrl = new URL(finalReturnTo, url.origin);
          const fragment = new URLSearchParams({
            access_token: tokens.access_token,
            ...(tokens.refresh_token && { refresh_token: tokens.refresh_token })
          });

          return new ExpoResponse(null, {
            status: 302,
            headers: {
              'Location': `${redirectUrl.pathname}#${fragment.toString()}`,
              'Cache-Control': 'no-store'
            }
          });
        }
      } else {
        const errorBody = await refreshResponse.text().catch(() => '');
        const compactBody = errorBody.replace(/\s+/g, ' ').slice(0, 180);
        failureReason = compactBody
          ? `Directus /auth/refresh returned ${refreshResponse.status}: ${compactBody}`
          : `Directus /auth/refresh returned ${refreshResponse.status}.`;
        console.log('[OAuth Callback] Refresh failed:', failureReason);
      }
    } catch (error) {
      failureReason = error instanceof Error ? error.message : String(error);
      console.error('[OAuth Callback] Error during refresh:', error instanceof Error ? error.message : String(error));
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
