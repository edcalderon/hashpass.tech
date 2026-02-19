import { ExpoRequest, ExpoResponse } from 'expo-router/server';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://sso.hashpass.co';

// Fallback callback handler - for compatibility with old Directus-based flow
// New flow uses /auth/oauth/google instead
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo') || '/(shared)/dashboard/explore';
  
  console.log('[OAuth Callback] Processing callback (legacy handler)');
  console.log('[OAuth Callback] Full URL:', url.toString());
  
  // Check if we received tokens directly in URL from Directus
  const urlAccessToken = url.searchParams.get('access_token');
  const urlRefreshToken = url.searchParams.get('refresh_token');
  
  if (urlAccessToken) {
    console.log('[OAuth Callback] ✅ Found tokens in URL');
    // Redirect with tokens in URL fragment
    const redirectUrl = new URL(returnTo, url.origin);
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
  
  // Check if we have session cookies
  const cookies = request.headers.get('Cookie') || '';
  if (cookies) {
    console.log('[OAuth Callback] Attempting to refresh session with cookies');
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
          const redirectUrl = new URL(returnTo, url.origin);
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
      }
    } catch (error) {
      console.error('[OAuth Callback] Error during refresh:', error instanceof Error ? error.message : String(error));
    }
  }
  
  // Failed - redirect to auth page with error
  console.error('[OAuth Callback] ❌ Failed to obtain tokens');
  const errorUrl = new URL('/(shared)/auth', url.origin);
  errorUrl.searchParams.set('error', 'oauth_failed');
  errorUrl.searchParams.set('message', 'OAuth authentication failed. Please try again.');
  
  return new ExpoResponse(null, {
    status: 302,
    headers: {
      'Location': errorUrl.toString(),
      'Cache-Control': 'no-store'
    }
  });
}
