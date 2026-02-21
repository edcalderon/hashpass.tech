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
<<<<<<< Updated upstream
  const feOriginSearch = url.searchParams.get('feOrigin');

  console.log('[Google OAuth] Callback received');
  console.log('[Google OAuth] State:', state);
  console.log('[Google OAuth] feOrigin (search):', feOriginSearch);

  // Try to get returnTo from cookie (set by login endpoint)
  const cookies = request.headers.get('Cookie') || '';
  const returnToCookie = cookies.split(';').find(c => c.trim().startsWith('oauth_return_to='));
  let returnTo = '/dashboard/explore';
  let cookieOrigin = '';
  if (returnToCookie) {
    const eqIdx = returnToCookie.indexOf('=');
    if (eqIdx !== -1) {
      try {
        const decoded = decodeURIComponent(returnToCookie.substring(eqIdx + 1).trim());
        if (decoded.startsWith('http')) {
          const parsedUrl = new URL(decoded);
          cookieOrigin = parsedUrl.origin;
          returnTo = parsedUrl.pathname + parsedUrl.search;
        } else {
          returnTo = decoded;
        }
        console.log('[Google OAuth] Found returnTo from cookie:', returnTo, 'cookieOrigin:', cookieOrigin);
      } catch (e) {
        console.warn('[Google OAuth] Failed to decode returnTo cookie');
      }
    }
  }

  // Robust frontend origin resolution
  const envFrontendUrl = process.env.FRONTEND_URL || process.env.EXPO_PUBLIC_FRONTEND_URL;
  let feOrigin = feOriginSearch || cookieOrigin || envFrontendUrl || url.origin;

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
=======
  
  // Try to get returnTo from cookie (set by login endpoint)
  const cookies = request.headers.get('Cookie') || '';
  const returnToCookie = cookies.split(';').find(c => c.trim().startsWith('oauth_return_to='));
  let returnTo = returnToCookie ? decodeURIComponent(returnToCookie.split('=')[1]) : '/(shared)/dashboard/explore';
  
  console.log('[Google OAuth] Received callback from Google');
  console.log('[Google OAuth] Code:', code ? code.substring(0, 20) + '...' : 'MISSING');
  console.log('[Google OAuth] State:', state ? state.substring(0, 20) + '...' : 'MISSING');
  console.log('[Google OAuth] Return to:', returnTo);
  
  if (!code) {
    const error = url.searchParams.get('error');
    console.error('[Google OAuth] Google returned error:', error);
    const errorUrl = new URL('/(shared)/auth', url.origin);
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
>>>>>>> Stashed changes
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
<<<<<<< Updated upstream
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
=======
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
>>>>>>> Stashed changes
    const adminLoginResponse = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL || 'admin@hashpass.tech',
        password: process.env.ADMIN_PASSWORD || ''
      })
    });
<<<<<<< Updated upstream

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
=======
    
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
      const updateUserResponse = await fetch(`${DIRECTUS_URL}/users/${userId}`, {
        method: 'PATCH',
>>>>>>> Stashed changes
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
<<<<<<< Updated upstream
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

    // Set routing and token data in search params (bulletproof delivery through routers)
    callbackUrl.searchParams.set('rt', rtPath);
    callbackUrl.searchParams.set('provider', 'google');
    callbackUrl.searchParams.set('access_token', tokens.access_token);
    if (tokens.refresh_token) {
      callbackUrl.searchParams.set('refresh_token', tokens.refresh_token);
    }
    callbackUrl.searchParams.set('email', userEmail);
    callbackUrl.searchParams.set('oauth_complete', 'true');
    callbackUrl.searchParams.set('oauth_success', 'true');

    // Put tokens in the hash fragment as well for security/Directus parsing compatibility
    const hashFragment = new URLSearchParams();
    hashFragment.set('access_token', tokens.access_token);
    if (tokens.refresh_token) {
      hashFragment.set('refresh_token', tokens.refresh_token);
    }
    hashFragment.set('email', userEmail);
    hashFragment.set('oauth_complete', 'true');
    hashFragment.set('oauth_success', 'true');

    // Combine them safely
    const finalUrl = `${callbackUrl.toString()}#${hashFragment.toString()}`;
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
=======
          password: tempPassword
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
          
          // Build full redirect URL with tokens in fragment
          const redirectUrl = new URL(returnTo, url.origin);
          const fragment = new URLSearchParams({
            access_token: tokens.access_token,
            ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
            email: userEmail
          });
          
          const finalUrl = `${redirectUrl.toString().split('#')[0]}#${fragment.toString()}`;
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
    
    const errorUrl = new URL('/(shared)/auth', url.origin);
    errorUrl.searchParams.set('error', 'oauth_failed');
    errorUrl.searchParams.set('message', error instanceof Error ? error.message : 'OAuth authentication failed');
    
    return new ExpoResponse(null, {
      status: 302,
      headers: {
        'Location': errorUrl.toString(),
        'Cache-Control': 'no-store'
      }
    });
>>>>>>> Stashed changes
  }
}
