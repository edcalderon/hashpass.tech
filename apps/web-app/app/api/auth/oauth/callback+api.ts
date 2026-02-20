
const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';

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
        'Cache-Control': 'no-store'
      }
    });
  }

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
  });
}
