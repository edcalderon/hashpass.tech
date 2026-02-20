
const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';

// OAuth Callback Handler
//
// After Directus processes the Google OAuth, it redirects here with auth cookies
// on the Directus domain (sso-dev.hashpass.co). Cross-domain cookies don't work
// in modern browsers, so we redirect to a TOKEN RELAY PAGE hosted on the Directus
// domain itself. This relay page:
//   1. Runs on sso-dev.hashpass.co (same domain as cookies = first-party)
//   2. Calls /auth/refresh with credentials:include (cookie IS sent)
//   3. Gets access_token + refresh_token from JSON response
//   4. Redirects to frontend /auth/callback#access_token=xxx&refresh_token=xxx

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const feOrigin = url.searchParams.get('fe') || url.origin;
  const returnTo = url.searchParams.get('rt') || '/dashboard/explore';
  const reason = url.searchParams.get('reason');

  console.log('[OAuth Callback] Processing callback from Directus');
  console.log('[OAuth Callback] Frontend origin:', feOrigin);
  console.log('[OAuth Callback] Return to:', returnTo);
  console.log('[OAuth Callback] Directus URL:', DIRECTUS_URL);

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

  // Check URL params for tokens
  const accessToken = url.searchParams.get('access_token');
  if (accessToken) {
    console.log('[OAuth Callback] ✅ Found access_token in URL');
    const redirectUrl = new URL('/auth/callback', feOrigin);
    const fragment = new URLSearchParams({
      access_token: accessToken,
      ...(url.searchParams.get('refresh_token') && { refresh_token: url.searchParams.get('refresh_token')! })
    });
    return new Response(null, {
      status: 302,
      headers: { 'Location': `${redirectUrl.toString()}#${fragment.toString()}`, 'Cache-Control': 'no-store' }
    });
  }

  // Redirect to the TOKEN RELAY page on the Directus domain.
  // This page runs same-origin JS that can read the httpOnly refresh_token cookie,
  // exchanges it for an access_token, and redirects to the frontend with tokens.
  const relayUrl = new URL('/auth-relay', DIRECTUS_URL);
  relayUrl.searchParams.set('fe', feOrigin);
  relayUrl.searchParams.set('rt', returnTo);

  console.log('[OAuth Callback] ↩️ Redirecting to token relay:', relayUrl.toString());

  return new Response(null, {
    status: 302,
    headers: {
      'Location': relayUrl.toString(),
      'Cache-Control': 'no-store'
    }
  });
}
