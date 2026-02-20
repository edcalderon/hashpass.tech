
// Support both local and production Directus URLs
const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';

// OAuth callback handler
// 
// CRITICAL DESIGN NOTES:
// 1. Directus v11 NEVER puts tokens in URL query params when `redirect` is set.
//    With AUTH_GOOGLE_MODE=json, it puts refresh_token in an httpOnly cookie on
//    the Directus domain (sso-dev.hashpass.co).
// 2. Since this callback runs on api-dev.hashpass.tech, we CANNOT read Directus cookies.
// 3. Browser cookies set during the login step (oauth_fe_origin, oauth_return_to)
//    also don't arrive because the redirect chain goes through sso-dev.hashpass.co
//    which is a cross-site navigation.
// 4. SOLUTION: feOrigin and returnTo are passed as query params in the callback URL.
//
// The remaining challenge: getting the actual auth tokens. Since Directus only puts
// them in cookies on its own domain, we need the FRONTEND to handle the final
// token exchange. This callback redirects to the frontend, which then does:
//   - Call sso-dev.hashpass.co/auth/refresh with credentials:include
//   - Or call sso-dev.hashpass.co/users/me with credentials:include

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Read feOrigin and returnTo from query params (set by login endpoint)
  const feOrigin = url.searchParams.get('fe') || url.origin;
  const returnTo = url.searchParams.get('rt') || '/dashboard/explore';
  const reason = url.searchParams.get('reason');

  console.log('[OAuth Callback] Processing callback from Directus');
  console.log('[OAuth Callback] Frontend origin:', feOrigin);
  console.log('[OAuth Callback] Return to:', returnTo);
  console.log('[OAuth Callback] URL:', url.toString());
  console.log('[OAuth Callback] All query params:', Object.fromEntries(url.searchParams.entries()));

  // Log cookies for debugging
  const cookies = request.headers.get('Cookie') || '';
  console.log('[OAuth Callback] Cookies received:', cookies ? cookies.replace(/=[^;]+/g, '=***') : '(none)');

  // Check for Directus error
  if (reason) {
    console.error('[OAuth Callback] ❌ Directus returned error:', reason);
    const errorUrl = new URL('/auth', feOrigin);
    errorUrl.searchParams.set('error', 'oauth_failed');
    errorUrl.searchParams.set('message', `Directus OAuth error: ${reason}`);
    return new Response(null, {
      status: 302,
      headers: { 'Location': errorUrl.toString(), 'Cache-Control': 'no-store' }
    });
  }

  // Check for tokens in URL (they won't be there with redirect, but check anyway)
  const accessToken = url.searchParams.get('access_token');
  const refreshToken = url.searchParams.get('refresh_token');

  if (accessToken) {
    console.log('[OAuth Callback] ✅ Found access_token in URL params');
    const redirectUrl = new URL('/auth/callback', feOrigin);
    const fragment = new URLSearchParams({
      access_token: accessToken,
      ...(refreshToken && { refresh_token: refreshToken })
    });
    return new Response(null, {
      status: 302,
      headers: { 'Location': `${redirectUrl.toString()}#${fragment.toString()}`, 'Cache-Control': 'no-store' }
    });
  }

  // Since Directus puts tokens in cookies on its OWN domain, we cannot read them here.
  // Redirect to the frontend's /auth/callback page. The frontend runs on a different
  // domain but can make credentialed requests to Directus to exchange the session.
  // Pass a flag so the frontend knows this is a Directus OAuth completion.
  console.log('[OAuth Callback] ↩️ Redirecting to frontend for session exchange');
  const frontendCallback = new URL('/auth/callback', feOrigin);
  frontendCallback.searchParams.set('oauth_complete', 'true');
  frontendCallback.searchParams.set('provider', 'google');

  return new Response(null, {
    status: 302,
    headers: {
      'Location': frontendCallback.toString(),
      'Cache-Control': 'no-store'
    }
  });
}
