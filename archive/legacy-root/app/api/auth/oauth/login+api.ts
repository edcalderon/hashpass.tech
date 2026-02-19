import { ExpoRequest, ExpoResponse } from 'expo-router/server';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://sso.hashpass.co';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Proxy endpoint for OAuth login - starts the OAuth flow
export async function GET(request: ExpoRequest): Promise<ExpoResponse> {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'google';
  let returnTo = url.searchParams.get('returnTo') || '/(shared)/dashboard/explore';
  
  // If returnTo is just /auth, redirect to dashboard instead
  if (returnTo === '/auth' || returnTo === '/(shared)/auth') {
    returnTo = '/(shared)/dashboard/explore';
  }
  
  console.log('[OAuth Login] Starting OAuth flow');
  console.log('[OAuth Login] Provider:', provider);
  console.log('[OAuth Login] Return to:', returnTo);
  
  if (provider === 'google') {
    // Redirect directly to Google OAuth
    const appDomain = request.headers.get('X-Forwarded-Host') || 'localhost:8081';
    const callbackUrl = `http://${appDomain}/api/auth/oauth/google`;
    
    // Generate PKCE state
    const state = Buffer.from(Math.random().toString()).toString('base64url');
    
    const googleOAuthParams = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID || '',
      response_type: 'code',
      scope: 'openid profile email',
      redirect_uri: callbackUrl,
      state: state,
      access_type: 'offline',
      prompt: 'consent'
    });
    
    const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?${googleOAuthParams.toString()}`;
    
    console.log('[OAuth Login] Redirecting to Google:', googleUrl);
    
    return new ExpoResponse(null, {
      status: 302,
      headers: {
        'Location': googleUrl,
        'Cache-Control': 'no-store',
        'Set-Cookie': `oauth_return_to=${encodeURIComponent(returnTo)}; Path=/; Max-Age=600; SameSite=Lax`
      }
    });
  }
  
  // Default: redirect to Directus auth endpoint for other providers
  const oauthUrl = `${DIRECTUS_URL}/auth/login/${provider}`;
  
  console.log('[OAuth Login] Redirecting to Directus:', oauthUrl);
  
  return new ExpoResponse(null, {
    status: 302,
    headers: {
      'Location': oauthUrl,
      'Cache-Control': 'no-store'
    }
  });
}

