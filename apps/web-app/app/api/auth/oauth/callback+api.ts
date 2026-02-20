
// Support both local and production Directus URLs
const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';

// OAuth callback handler - the FINAL redirect destination after Directus processes Google OAuth.
// 
// KEY INSIGHT: Directus v11 ALWAYS puts tokens in httpOnly cookies when a `redirect` is set,
// never as URL query parameters. Since Directus runs on a different domain (sso-dev.hashpass.co)
// than the API Gateway (api-dev.hashpass.tech), we cannot read those cookies directly.
//
// SOLUTION: We use `redirect: none` in the actual OAuth flow. Instead, when Directus redirects
// here after OAuth, we make a server-to-server call to Directus's /auth/refresh using
// the refresh_token cookie that Directus set during the redirect chain. Since this handler
// runs on the SAME domain as the redirect target, the browser sends us the cookie.
//
// Actually, Directus sets the cookie on ITS domain, which means we'll never see it.
// The real approach: capture the Set-Cookie from the redirect response itself.
//
// Flow:
// 1. User clicks "Sign in with Google"
// 2. /api/auth/oauth/login redirects to Directus /auth/login/google?redirect=<this URL>
// 3. Directus redirects to Google
// 4. Google redirects back to Directus /auth/login/google/callback
// 5. Directus processes OAuth, creates user session, sets refresh_token cookie, 
//    and redirects to this URL (302 with Set-Cookie header)
// 6. Browser follows redirect to this endpoint
// 7. This endpoint receives the Directus cookies (directus_refresh_token) from the 
//    redirect response and uses them to get an access_token server-side
// 8. Redirects to the frontend with tokens in the URL fragment

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

  const feOriginCookie = cookies.split(';').find(c => c.trim().startsWith('oauth_fe_origin='));
  let feOrigin = url.origin;
  if (feOriginCookie) {
    try {
      feOrigin = new URL(decodeURIComponent(feOriginCookie.split('=')[1])).origin;
    } catch { }
  }

  console.log('[OAuth Callback] Processing callback from Directus');
  console.log('[OAuth Callback] Return to:', finalReturnTo);
  console.log('[OAuth Callback] Frontend origin:', feOrigin);
  console.log('[OAuth Callback] Directus URL:', DIRECTUS_URL);
  console.log('[OAuth Callback] All cookies received:', cookies.replace(/=[^;]+/g, '=***'));

  // Check for Directus error reasons in URL
  const reason = url.searchParams.get('reason');
  if (reason) {
    console.error('[OAuth Callback] ❌ Directus returned error reason:', reason);
    const errorUrl = new URL('/auth', feOrigin);
    errorUrl.searchParams.set('error', 'oauth_failed');
    errorUrl.searchParams.set('message', `Directus OAuth error: ${reason}`);
    return new Response(null, {
      status: 302,
      headers: { 'Location': errorUrl.toString(), 'Cache-Control': 'no-store' }
    });
  }

  // Strategy 1: Check if we received tokens in URL (unlikely with Directus redirect, but possible)
  const urlAccessToken = url.searchParams.get('access_token');
  const urlRefreshToken = url.searchParams.get('refresh_token');
  if (urlAccessToken) {
    console.log('[OAuth Callback] ✅ Found tokens in URL query params');
    return redirectWithTokens(feOrigin, finalReturnTo, urlAccessToken, urlRefreshToken || undefined);
  }

  // Strategy 2: Extract directus_refresh_token from cookies
  // When AUTH_GOOGLE_MODE=json and Directus redirects here, it sets a directus_refresh_token cookie
  // on its own domain. But since this handler runs on api-dev domain, we can't read that cookie.
  // HOWEVER - the cookie might be forwarded if the redirect comes from the same domain.
  const directusRefreshCookie = cookies.split(';').find(c =>
    c.trim().startsWith('directus_refresh_token=')
  );

  if (directusRefreshCookie) {
    const refreshToken = directusRefreshCookie.split('=').slice(1).join('=').trim();
    if (refreshToken) {
      console.log('[OAuth Callback] Found directus_refresh_token cookie, exchanging for access token...');
      try {
        const refreshResponse = await fetch(`${DIRECTUS_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken, mode: 'json' })
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          const tokens = refreshData.data || refreshData;
          if (tokens.access_token) {
            console.log('[OAuth Callback] ✅ Got tokens from refresh exchange');
            return redirectWithTokens(feOrigin, finalReturnTo, tokens.access_token, tokens.refresh_token);
          }
        } else {
          const errorBody = await refreshResponse.text().catch(() => '');
          console.log('[OAuth Callback] Refresh with cookie failed:', refreshResponse.status, errorBody.slice(0, 200));
        }
      } catch (error) {
        console.error('[OAuth Callback] Error refreshing with cookie:', error);
      }
    }
  }

  // Strategy 3: Try passing ALL cookies to Directus /auth/refresh
  // The browser might have Directus cookies from the redirect chain
  if (cookies) {
    console.log('[OAuth Callback] Attempting session refresh with forwarded cookies...');
    try {
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
          console.log('[OAuth Callback] ✅ Got tokens from cookie-forwarded refresh');
          return redirectWithTokens(feOrigin, finalReturnTo, tokens.access_token, tokens.refresh_token);
        }
      } else {
        const errorBody = await refreshResponse.text().catch(() => '');
        failureReason = `Directus /auth/refresh returned ${refreshResponse.status}: ${errorBody.slice(0, 200)}`;
        console.log('[OAuth Callback] Cookie refresh failed:', failureReason);
      }
    } catch (error) {
      failureReason = error instanceof Error ? error.message : String(error);
      console.error('[OAuth Callback] Error during cookie refresh:', failureReason);
    }
  }

  // Strategy 4: Try /users/me with session cookies  
  console.log('[OAuth Callback] Attempting /users/me with session cookies...');
  try {
    const userResponse = await fetch(`${DIRECTUS_URL}/users/me`, {
      method: 'GET',
      headers: {
        'Cookie': cookies,
      }
    });

    if (userResponse.ok) {
      const userData = await userResponse.json();
      if (userData.data) {
        console.log('[OAuth Callback] ✅ Got user from session cookies');
        // We have user data but no tokens - set oauth_success flag
        const redirectUrl = new URL('/auth/callback', feOrigin);
        redirectUrl.hash = `oauth_success=true&user_id=${userData.data.id}&email=${encodeURIComponent(userData.data.email || '')}`;
        return new Response(null, {
          status: 302,
          headers: { 'Location': redirectUrl.toString(), 'Cache-Control': 'no-store' }
        });
      }
    }
  } catch (error) {
    console.log('[OAuth Callback] /users/me with cookies failed:', error);
  }

  // All strategies failed
  console.error('[OAuth Callback] ❌ Failed to obtain tokens from Directus');
  console.error('[OAuth Callback] Failure reason:', failureReason);
  const errorUrl = new URL('/auth', feOrigin);
  errorUrl.searchParams.set('error', 'oauth_failed');
  errorUrl.searchParams.set('message', `Authentication could not be completed. ${failureReason} Redirecting to login.`);

  return new Response(null, {
    status: 302,
    headers: {
      'Location': errorUrl.toString(),
      'Cache-Control': 'no-store'
    }
  });
}

function redirectWithTokens(feOrigin: string, returnTo: string, accessToken: string, refreshToken?: string): Response {
  const redirectUrl = new URL('/auth/callback', feOrigin);
  const fragment = new URLSearchParams({
    access_token: accessToken,
    ...(refreshToken && { refresh_token: refreshToken })
  });

  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${redirectUrl.toString()}#${fragment.toString()}`,
      'Cache-Control': 'no-store'
    }
  });
}
