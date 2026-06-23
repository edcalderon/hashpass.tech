import { getSupabaseServerEnv, getSupabaseServerForRequest } from '../../../../lib/supabase-server';
import { resolvePublicSupabaseConfig } from '../../../../config/supabase-profiles';
import { hostnameFromRequest } from '../../../../config/supabase-profiles';
import { syncPublicUserRegistry } from '../../../../lib/auth/public-user-registry';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

type ParsedTokenHash = {
  tokenHash: string;
  verificationType: string;
};

function parseStoredTokenHash(rawTokenHash: string | null | undefined): ParsedTokenHash {
  const fallback: ParsedTokenHash = {
    tokenHash: rawTokenHash?.trim() || '',
    verificationType: 'magiclink',
  };

  if (!rawTokenHash) return fallback;

  const separatorIndex = rawTokenHash.indexOf('::');
  if (separatorIndex <= 0) return fallback;

  const verificationType = rawTokenHash.slice(0, separatorIndex).trim();
  const tokenHash = rawTokenHash.slice(separatorIndex + 2).trim();

  if (!tokenHash) return fallback;

  return {
    tokenHash,
    verificationType: verificationType || 'magiclink',
  };
}

// Handle CORS preflight requests
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

/**
 * API endpoint to verify OTP code.
 *
 * Flow:
 * 1. Look up the 6-digit code in otp_codes (service-role client).
 * 2. Mark the code as used.
 * 3. Generate a fresh single-use magic-link via the admin API.
 * 4. Verify the fresh token using an anon-key client (same Supabase project,
 *    resolved from the request hostname). GoTrue rejects token_hash verification
 *    when the Authorization header carries a service-role key.
 * 5. Return the session to the client; client calls supabase.auth.setSession().
 */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServerForRequest(request);
    const body = await request.json();
    const { email, code } = body;

    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: 'Email and code are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Clean up expired OTP codes
    await supabase.rpc('cleanup_expired_otp_codes');
    const { selectedProfile, usingDevFallback } = getSupabaseServerEnv(request);

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.toString().trim();

    // Look up the token_hash from the code
    const { data: otpData, error: lookupError } = await supabase
      .from('otp_codes')
      .select('token_hash, used, expires_at, email')
      .eq('email', normalizedEmail)
      .eq('code', normalizedCode)
      .or('used.eq.false,used.is.null')
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error('OTP lookup error:', lookupError);
      return new Response(
        JSON.stringify({
          error: 'Database error while verifying code',
          details: lookupError.message
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (!otpData) {
      console.log('OTP code not found:', {
        email: normalizedEmail,
        code: normalizedCode,
        selectedProfile,
        usingDevFallback,
      });

      // Check if code exists but is used or expired
      const { data: expiredData } = await supabase
        .from('otp_codes')
        .select('used, expires_at')
        .eq('email', normalizedEmail)
        .eq('code', normalizedCode)
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (expiredData) {
        if (expiredData.used) {
          return new Response(
            JSON.stringify({ error: 'This code has already been used' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
        if (new Date(expiredData.expires_at) < new Date()) {
          return new Response(
            JSON.stringify({ error: 'This code has expired' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
      }

      return new Response(
        JSON.stringify({ error: 'Invalid verification code' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const parsedToken = parseStoredTokenHash(otpData.token_hash);
    if (!parsedToken.tokenHash) {
      return new Response(
        JSON.stringify({ error: 'Invalid verification token payload' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Mark the code as used before touching Supabase auth so it cannot be replayed.
    await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('email', normalizedEmail)
      .eq('code', normalizedCode)
      .eq('token_hash', otpData.token_hash);

    // Generate a fresh single-use magic-link using the admin (service-role) client.
    // We immediately redeem it via an anon-key client so the session is established
    // server-side. GoTrue rejects token_hash verification requests that carry a
    // service-role Authorization header ("Only the token_hash and type should be provided").
    const { data: freshLinkData, error: freshLinkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    });

    if (freshLinkError || !freshLinkData) {
      console.error('OTP verify: failed to generate fresh magic link:', freshLinkError);
      return new Response(
        JSON.stringify({ error: 'Failed to prepare authentication token', code: 'link_gen_failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const freshVerificationType =
      typeof freshLinkData.properties?.verification_type === 'string'
        ? freshLinkData.properties.verification_type
        : 'magiclink';

    let freshTokenHash =
      typeof freshLinkData.properties?.hashed_token === 'string'
        ? freshLinkData.properties.hashed_token.trim()
        : '';

    if (!freshTokenHash && freshLinkData.properties?.action_link) {
      try {
        const u = new URL(freshLinkData.properties.action_link);
        freshTokenHash = u.searchParams.get('token_hash') || u.searchParams.get('token') || '';
      } catch { /* ignore parse errors */ }
    }

    if (!freshTokenHash) {
      return new Response(
        JSON.stringify({ error: 'Could not extract authentication token', code: 'link_gen_failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Resolve the anon key for this request's Supabase project (same project as the
    // service-role client — determined by request hostname). Using the anon key avoids
    // GoTrue's rejection of service-role token_hash verification.
    const hostname = hostnameFromRequest(request);
    const { supabaseUrl: anonUrl, supabaseAnonKey: anonKey } = resolvePublicSupabaseConfig({ hostname });

    if (!anonUrl || !anonKey) {
      console.error('OTP verify: missing anon Supabase config for hostname:', hostname);
      return new Response(
        JSON.stringify({ error: 'Server configuration error', code: 'server_config_error' }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Verify the fresh token via a direct GoTrue HTTP request.
    // Using the Supabase JS client here can cause GoTrue to reject the request
    // ("Only the token_hash and type should be provided") due to client-side
    // PKCE / extra-field behaviour. Raw fetch gives us full control over the body.
    const gotrueVerifyUrl = `${anonUrl}/auth/v1/verify`;

    const verificationTypes = Array.from(
      new Set([freshVerificationType, 'magiclink', 'signup', 'email'])
    );

    let verificationResult: { data: any; error: any } | null = null;

    for (const type of verificationTypes) {
      let res: Response;
      try {
        res = await fetch(gotrueVerifyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ token_hash: freshTokenHash, type }),
        });
      } catch (fetchErr) {
        verificationResult = { data: null, error: { message: String(fetchErr), code: 'fetch_error' } };
        break;
      }

      if (res.ok) {
        const resData = await res.json();
        // GoTrue returns: { access_token, refresh_token, expires_in, token_type, user, ... }
        verificationResult = {
          data: {
            session: {
              access_token: resData.access_token,
              refresh_token: resData.refresh_token,
              expires_in: resData.expires_in,
              token_type: resData.token_type,
            },
            user: resData.user,
          },
          error: null,
        };
        break;
      }

      const errData = await res.json().catch(() => ({}));
      const message: string = errData.msg || errData.error_description || errData.message || `status ${res.status}`;
      const canRetry =
        /email link is invalid or has expired/i.test(message) ||
        /otp has expired or is invalid/i.test(message);

      verificationResult = { data: null, error: { message, code: errData.error_code || 'verify_failed' } };
      if (!canRetry) break;
    }

    if (!verificationResult || verificationResult.error) {
      const errorMessage = verificationResult?.error?.message || 'Failed to verify OTP';
      console.error('OTP verify: GoTrue verification failed:', errorMessage);
      return new Response(
        JSON.stringify({
          error: errorMessage,
          code: verificationResult?.error?.code || 'otp_verify_failed',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const session = verificationResult.data?.session || null;
    const user = verificationResult.data?.user || null;

    if (user?.id && user?.email) {
      await syncPublicUserRegistry(request, {
        provider: 'supabase',
        authUserId: user.id,
        email: user.email,
        firstName: user.user_metadata?.first_name || null,
        lastName: user.user_metadata?.last_name || null,
        fullName: user.user_metadata?.full_name || null,
        avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        status: user.user_metadata?.status || 'active',
        emailVerifiedAt: user.email_confirmed_at || user.confirmed_at || null,
        lastSignInAt: user.last_sign_in_at || null,
        authMetadata: user.app_metadata || {},
        profileMetadata: user.user_metadata || {},
        providerIds: { supabase: user.id },
      });
    }

    console.log('OTP code verified on server, returning session payload to client');

    return new Response(
      JSON.stringify({
        success: true,
        token_hash: freshTokenHash,
        type: freshVerificationType,
        email: normalizedEmail,
        session,
        user,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('OTP verification error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to verify OTP' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}
