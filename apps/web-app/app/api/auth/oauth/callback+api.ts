<<<<<<< Updated upstream

=======
import { ExpoRequest, ExpoResponse } from 'expo-router/server';

// Support both local and production Directus URLs
>>>>>>> Stashed changes
const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';

<<<<<<< Updated upstream
// OAuth Callback Handler
//
// DESIGN: Since AUTH_GOOGLE_MODE=json is set on the Directus server,
// Directus will append access_token and refresh_token to this redirect
// URL as query parameters. This allows us to capture them server-side
// and relay them to the frontend via the URL fragment, bypassing all
// cross-domain cookie restrictions.

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const feOrigin = url.searchParams.get('fe') || url.origin;
  const returnTo = url.searchParams.get('rt') || '/dashboard/explore';
  const reason = url.searchParams.get('reason');

  console.log('[OAuth Callback] Processing callback from Directus');
  console.log('[OAuth Callback] Frontend origin:', feOrigin);
  console.log('[OAuth Callback] Return to:', returnTo);

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

  // Capture tokens from URL parameters (mode=json)
  const accessToken = url.searchParams.get('access_token');
  const refreshToken = url.searchParams.get('refresh_token');

  if (accessToken) {
    console.log('[OAuth Callback] ✅ Success! Received tokens from Directus.');
    const redirectUrl = new URL('/auth/callback', feOrigin);
    // Use fragment for tokens to keep them out of server logs on the final jump
    const fragment = new URLSearchParams({
      access_token: accessToken,
      ...(refreshToken && { refresh_token: refreshToken })
    });

    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${redirectUrl.toString()}#${fragment.toString()}`,
=======
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
>>>>>>> Stashed changes
        'Cache-Control': 'no-store'
      }
    });
  }
<<<<<<< Updated upstream

  // If we reach here, Directus completed without tokens or error.
  // This happens if the session mode is still somehow being forced or the payload is missing.
  console.error('[OAuth Callback] ❌ Failed! No tokens found in URL.');
  console.log('[OAuth Callback] Params received:', Array.from(url.searchParams.keys()));

  const errorUrl = new URL('/auth', feOrigin);
  errorUrl.searchParams.set('error', 'no_tokens');
  errorUrl.searchParams.set('message', 'Directus completed OAuth but did not return tokens in the URL.');

  return new Response(null, {
    status: 302,
    headers: { 'Location': errorUrl.toString(), 'Cache-Control': 'no-store' }
=======
  
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
>>>>>>> Stashed changes
  });
}
