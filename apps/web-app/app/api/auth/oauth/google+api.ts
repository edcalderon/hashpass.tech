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
  const feOriginSearch = url.searchParams.get('feOrigin');

  console.log('[Google OAuth] Callback received');
  console.log('[Google OAuth] State:', state);
  console.log('[Google OAuth] feOrigin (search):', feOriginSearch);

  // Try to get returnTo from cookie (set by login endpoint)
  const cookies = request.headers.get('Cookie') || '';
  const returnToCookie = cookies.split(';').find(c => c.trim().startsWith('oauth_return_to='));
  let returnTo = '/dashboard/explore';
  if (returnToCookie) {
    const eqIdx = returnToCookie.indexOf('=');
    if (eqIdx !== -1) {
      try {
        returnTo = decodeURIComponent(returnToCookie.substring(eqIdx + 1).trim());
        console.log('[Google OAuth] Found returnTo from cookie:', returnTo);
      } catch (e) {
        console.warn('[Google OAuth] Failed to decode returnTo cookie');
      }
    }
  }

  // Robust frontend origin resolution
  const envFrontendUrl = process.env.FRONTEND_URL || process.env.EXPO_PUBLIC_FRONTEND_URL;
  let feOrigin = feOriginSearch || envFrontendUrl || url.origin;

  // Ensure feOrigin is a valid absolute URL and not an API domain
  if (feOrigin.includes('api-dev.') || feOrigin.includes('api.')) {
    if (envFrontendUrl) {
      console.log('[Google OAuth] Correcting feOrigin from API domain to:', envFrontendUrl);
      feOrigin = envFrontendUrl;
    }
  }

  // Ensure feOrigin does not have a trailing slash for consistency
  feOrigin = feOrigin.replace(/\/$/, '');
  console.log('[Google OAuth] Final feOrigin for callback:', feOrigin);

  if (!code) {
    console.error('[Google OAuth] No code provided in callback');
    return ExpoResponse.redirect(`${feOrigin}/auth?error=no_code`);
  }

  try {
    // Step 1: Exchange code for Google access token
    console.log('[Google OAuth] Exchanging code for Google tokens...');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID || '',
        client_secret: GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${url.origin}${url.pathname}`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Google OAuth] Google token exchange failed:', tokenResponse.status, errorText);
      return ExpoResponse.redirect(`${feOrigin}/auth?error=google_token_failed`);
    }

    const tokenData = await tokenResponse.json();
    const googleAccessToken = tokenData.access_token;

    // Step 2: Get user profile from Google
    console.log('[Google OAuth] Fetching user profile from Google...');
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });

    if (!profileResponse.ok) {
      console.error('[Google OAuth] Google profile fetch failed:', profileResponse.status);
      return ExpoResponse.redirect(`${feOrigin}/auth?error=google_profile_failed`);
    }

    const userProfile = await profileResponse.json();
    const userEmail = userProfile.email;
    const userName = userProfile.name || userProfile.email?.split('@')[0];

    if (!userEmail) {
      console.error('[Google OAuth] No email returned from Google profile');
      return ExpoResponse.redirect(`${feOrigin}/auth?error=no_email`);
    }

    console.log('[Google OAuth] User:', userEmail);

    // Step 3: Get admin token to create/update user in Directus
    console.log('[Google OAuth] Authenticating as admin to Directus:', DIRECTUS_URL);
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
      console.error('[Google OAuth] Admin login failed:', adminLoginResponse.status, adminError.substring(0, 200));
      return ExpoResponse.redirect(`${feOrigin}/auth?error=admin_auth_failed`);
    }

    const adminData = await adminLoginResponse.json();
    const adminToken = adminData.data?.access_token;

    if (!adminToken) {
      console.error('[Google OAuth] No admin access token returned');
      return ExpoResponse.redirect(`${feOrigin}/auth?error=admin_token_missing`);
    }

    // Step 4: Check if user exists in Directus
    console.log('[Google OAuth] Checking for existing user:', userEmail);
    const userCheckResponse = await fetch(
      `${DIRECTUS_URL}/users?filter[email][_eq]=${encodeURIComponent(userEmail)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      }
    );

    let userId: string | undefined;

    if (userCheckResponse.ok) {
      const userData = await userCheckResponse.json();
      if (userData.data && userData.data.length > 0) {
        userId = userData.data[0].id;
        console.log('[Google OAuth] Found existing user:', userId);
      }
    } else {
      console.warn('[Google OAuth] User check failed with status:', userCheckResponse.status);
    }

    // Step 5: Create user if they don't exist
    if (!userId) {
      console.log('[Google OAuth] Creating new user...');
      const createUserResponse = await fetch(`${DIRECTUS_URL}/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: userEmail,
          first_name: userName,
          role: process.env.DEFAULT_ROLE_ID || '8530715f-c15b-419b-806d-8c0faaa4d8f0',
          provider: 'default', // Force default for password login fallback
          status: 'active'
        })
      });

      if (!createUserResponse.ok) {
        const errorText = await createUserResponse.text();
        console.error('[Google OAuth] User creation failed:', createUserResponse.status, errorText.substring(0, 200));
        return ExpoResponse.redirect(`${feOrigin}/auth?error=user_creation_failed`);
      }

      const newUser = await createUserResponse.json();
      userId = newUser.data?.id;
      console.log('[Google OAuth] Created user:', userId);
    }

    // Step 6: Update user with a fresh temporary password
    // This allows us to log in as them without knowing their actual password
    // We also reset provider to 'default' and clear auth_data to ensure password login is allowed.
    const tempPassword = Math.random().toString(36).slice(-16) + 'A1!';
    console.log('[Google OAuth] Updating user security settings...');
    const updateUserResponse = await fetch(`${DIRECTUS_URL}/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        password: tempPassword,
        provider: 'default',
        auth_data: null,
        status: 'active'
      })
    });

    if (!updateUserResponse.ok) {
      const errorText = await updateUserResponse.text();
      console.error('[Google OAuth] Security update failed:', updateUserResponse.status, errorText.substring(0, 200));
      return ExpoResponse.redirect(`${feOrigin}/auth?error=security_update_failed`);
    }

    // Step 7: Final login as the user
    console.log('[Google OAuth] Exchanging temporary credentials for Directus sessions...');
    const userTokenResponse = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: tempPassword
      })
    });

    if (!userTokenResponse.ok) {
      const errorText = await userTokenResponse.text();
      console.error('[Google OAuth] User session establishment failed:', userTokenResponse.status, errorText.substring(0, 200));
      return ExpoResponse.redirect(`${feOrigin}/auth?error=session_login_failed`);
    }

    const finalTokenData = await userTokenResponse.json();
    const tokens = finalTokenData.data || finalTokenData;

    if (!tokens.access_token) {
      console.error('[Google OAuth] No access token returned in final login');
      return ExpoResponse.redirect(`${feOrigin}/auth?error=token_missing`);
    }

    console.log('[Google OAuth] ✅ Successfully authenticated');

    // Step 8: Final Redirect to callback page
    const callbackUrl = new URL('/auth/callback', feOrigin);
    // Normalize returnTo to avoid protocol mismatches
    let rtPath = returnTo;
    if (rtPath.startsWith('http')) {
      try { rtPath = new URL(rtPath).pathname + new URL(rtPath).search; } catch (e) { }
    }
    callbackUrl.searchParams.set('rt', rtPath);

    const fragment = new URLSearchParams({
      access_token: tokens.access_token,
      ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
      email: userEmail,
      oauth_success: 'true'
    });

    const finalUrl = `${callbackUrl.toString().split('#')[0]}#${fragment.toString()}`;
    console.log('[Google OAuth] Redirecting to:', finalUrl.substring(0, 100) + '...');

    return new Response(null, {
      status: 302,
      headers: {
        'Location': finalUrl,
        'Cache-Control': 'no-store',
        'Set-Cookie': 'oauth_return_to=; Path=/; Max-Age=0' // Clear the cookie
      }
    });

  } catch (error) {
    console.error('[Google OAuth] Fatal error in flow:', error);
    const errorMsg = error instanceof Error ? encodeURIComponent(error.message) : 'unknown_error';
    return ExpoResponse.redirect(`${feOrigin}/auth?error=fatal_flow_error&message=${errorMsg}`);
  }
}
