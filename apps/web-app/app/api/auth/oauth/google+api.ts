import { ExpoRequest, ExpoResponse } from 'expo-router/server';

const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.EXPO_PUBLIC_DIRECTUS_URL ||
  'https://sso.hashpass.co';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

/**
 * Direct Google OAuth handler
 * This endpoint receives the authorization code from Google and exchanges it for tokens
 * Route: /auth/oauth/google?code=...&state=...
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // Try to get returnTo from cookie (set by login endpoint)
  const cookies = request.headers.get('Cookie') || '';
  const returnToCookie = cookies.split(';').find(c => c.trim().startsWith('oauth_return_to='));
  let returnTo = '/dashboard/explore';
  if (returnToCookie) {
    const eqIdx = returnToCookie.indexOf('=');
    if (eqIdx !== -1) {
      try { returnTo = decodeURIComponent(returnToCookie.substring(eqIdx + 1).trim()); } catch { }
    }
  }

  // Extract frontend origin if returnTo is an absolute URL
  let feOrigin = url.origin;
  try {
    if (returnTo.startsWith('http')) {
      feOrigin = new URL(returnTo).origin;
    } else {
      // If we lost the cookie and returnTo is relative, we MUST not use the API origin
      // as our frontend URL, because it doesn't serve the frontend properly.
      const envFrontendUrl = process.env.FRONTEND_URL || process.env.EXPO_PUBLIC_FRONTEND_URL;

      if (envFrontendUrl) {
        feOrigin = envFrontendUrl;
      } else if (feOrigin.includes('api-dev.hashpass.tech') || feOrigin.includes('sso-dev.hashpass.co')) {
        feOrigin = 'https://blockchainsummit-dev.hashpass.lat';
      } else if (feOrigin.includes('api.hashpass.tech') || feOrigin.includes('sso.hashpass.co')) {
        feOrigin = 'https://blockchainsummit.hashpass.lat';
      } else if (feOrigin.includes('localhost') || feOrigin.includes('127.0.0.1')) {
        // Assume local frontend is running on standard port since API is on 8081
        feOrigin = 'http://localhost:8081';
      }
    }
  } catch (e) { }

  console.log('[Google OAuth] Received callback from Google');
  console.log('[Google OAuth] Code:', code ? code.substring(0, 20) + '...' : 'MISSING');
  console.log('[Google OAuth] State:', state ? state.substring(0, 20) + '...' : 'MISSING');
  console.log('[Google OAuth] Return to:', returnTo);
  console.log('[Google OAuth] Frontend origin resolved:', feOrigin);

  if (!code) {
    const error = url.searchParams.get('error');
    console.error('[Google OAuth] Google returned error:', error);
    const errorUrl = new URL('/auth', feOrigin);
    errorUrl.searchParams.set('error', error || 'access_denied');
    errorUrl.searchParams.set('message', 'Google authentication was denied or failed');

    return new ExpoResponse(null, {
      status: 302,
      headers: { 'Location': errorUrl.toString() }
    });
  }

  try {
    // Step 1: Exchange code with Google for tokens
    console.log('[Google OAuth] Exchanging code with Google...');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: GOOGLE_CLIENT_ID || '',
        client_secret: GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${url.origin}/api/auth/oauth/google`,
        grant_type: 'authorization_code'
      }).toString()
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[Google OAuth] Google token exchange failed:', tokenResponse.status, errorData);
      throw new Error(`Google token exchange failed: ${tokenResponse.status}`);
    }

    const googleTokens = await tokenResponse.json();
    const googleAccessToken = googleTokens.access_token;
    console.log('[Google OAuth] Got access token from Google');

    // Step 2: Get user info from Google
    console.log('[Google OAuth] Fetching user profile from Google...');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });

    if (!profileResponse.ok) {
      throw new Error(`Failed to get user profile from Google: ${profileResponse.status}`);
    }

    const userProfile = await profileResponse.json();
    const userEmail = userProfile.email;
    const userName = userProfile.name || userProfile.email?.split('@')[0];
    console.log('[Google OAuth] User email from Google:', userEmail);
    console.log('[Google OAuth] User name from Google:', userName);

    // Step 3: Get admin token to create/update user in Directus
    console.log('[Google OAuth] Getting admin token for Directus...');
    const adminLoginResponse = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL || 'admin@hashpass.tech',
        password: process.env.ADMIN_PASSWORD || ''
      })
    });

    if (!adminLoginResponse.ok) {
      const adminError = await adminLoginResponse.text();
      console.error('[Google OAuth] Failed to get admin token:', adminLoginResponse.status, adminError.substring(0, 200));
      throw new Error('Failed to authenticate as admin');
    }

    const adminAuth = await adminLoginResponse.json();
    const adminToken = adminAuth.data?.access_token;

    if (!adminToken) {
      throw new Error('No admin token received');
    }

    console.log('[Google OAuth] Got admin token, creating/checking user...');

    // Now use admin token to check/create user
    try {
      // First, check if user exists
      const userCheckResponse = await fetch(
        `${DIRECTUS_URL}/users?filter[email][_eq]=${encodeURIComponent(userEmail)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('[Google OAuth] User check response:', userCheckResponse.status);

      let userId: string | undefined;

      if (userCheckResponse.ok) {
        const userData = await userCheckResponse.json();
        if (userData.data && userData.data.length > 0) {
          userId = userData.data[0].id;
          console.log('[Google OAuth] User exists:', userId);
        }
      }

      // If user doesn't exist, create them
      if (!userId) {
        console.log('[Google OAuth] Creating new user in Directus...');
        const createUserResponse = await fetch(`${DIRECTUS_URL}/users`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: userEmail,
            first_name: userName,
            role: process.env.DEFAULT_ROLE_ID,
            provider: 'default',
            status: 'active'
          })
        });

        console.log('[Google OAuth] User creation response:', createUserResponse.status);

        if (createUserResponse.ok) {
          const newUser = await createUserResponse.json();
          userId = newUser.data?.id;
          console.log('[Google OAuth] User created:', userId);
        } else {
          const errorText = await createUserResponse.text();
          console.error('[Google OAuth] Failed to create user:', errorText.substring(0, 200));
          throw new Error('Failed to create user');
        }
      }

      // Now get a token for this user by setting a temporary password and authenticating
      console.log('[Google OAuth] Generating temporary password for OAuth user...');

      // Generate a random temporary password
      const tempPassword = Buffer.from(Math.random().toString()).toString('base64').substring(0, 16);

      // Update user with temporary password using admin token
      // IMPORTANT: Also reset provider to 'default' and clear auth_data
      // so that Directus allows password-based login for this user.
      // Without this, users created via SSO have provider='google' which
      // blocks password authentication entirely.
      const updateUserResponse = await fetch(`${DIRECTUS_URL}/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password: tempPassword,
          provider: 'default',
          auth_data: null
        })
      });

      console.log('[Google OAuth] User password update response:', updateUserResponse.status);

      if (!updateUserResponse.ok) {
        const errorText = await updateUserResponse.text();
        console.error('[Google OAuth] Failed to set temp password:', errorText.substring(0, 200));
        throw new Error('Failed to set temporary password');
      }

      // Now authenticate as the user using email and temporary password
      console.log('[Google OAuth] Getting token for OAuth user...');

      const userTokenResponse = await fetch(`${DIRECTUS_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          password: tempPassword
        })
      });

      console.log('[Google OAuth] User token response:', userTokenResponse.status);

      if (userTokenResponse.ok) {
        const tokenData = await userTokenResponse.json();
        const tokens = tokenData.data || tokenData;

        if (tokens.access_token) {
          console.log('[Google OAuth] ✅ Got tokens for OAuth user');
          console.log('[Google OAuth] Access token:', tokens.access_token.substring(0, 20) + '...');
          console.log('[Google OAuth] Redirecting to:', returnTo);

          // Build redirect URL to the auth callback page (which has token extraction logic)
          // The callback page will extract tokens from the hash fragment and establish session
          const callbackUrl = new URL('/auth/callback', feOrigin);
          callbackUrl.searchParams.set('rt', typeof returnTo === 'string' && returnTo.startsWith('http') ? new URL(returnTo).pathname : (returnTo || '/dashboard/explore'));
          const fragment = new URLSearchParams({
            access_token: tokens.access_token,
            ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
            email: userEmail
          });

          const finalUrl = `${callbackUrl.toString().split('#')[0]}#${fragment.toString()}`;
          console.log('[Google OAuth] Final redirect URL:', finalUrl.substring(0, 100) + '...');

          return new ExpoResponse(null, {
            status: 302,
            headers: {
              'Location': finalUrl,
              'Cache-Control': 'no-store',
              'Set-Cookie': 'oauth_return_to=; Path=/; Max-Age=0' // Clear the cookie
            }
          });
        }
      } else {
        const errorText = await userTokenResponse.text();
        console.error('[Google OAuth] Failed to get user token:', userTokenResponse.status, errorText.substring(0, 200));
      }
    } catch (dirError) {
      console.error('[Google OAuth] Directus operation failed:', dirError instanceof Error ? dirError.message : String(dirError));
    }

    // If we get here, something went wrong
    throw new Error('Failed to authenticate user in Directus after Google OAuth');

  } catch (error) {
    console.error('[Google OAuth] ❌ Error:', error instanceof Error ? error.message : String(error));

    const errorUrl = new URL('/auth', feOrigin);
    errorUrl.searchParams.set('error', 'oauth_failed');
    errorUrl.searchParams.set('message', error instanceof Error ? error.message : 'OAuth authentication failed');

    return new ExpoResponse(null, {
      status: 302,
      headers: {
        'Location': errorUrl.toString(),
        'Cache-Control': 'no-store'
      }
    });
  }
}
