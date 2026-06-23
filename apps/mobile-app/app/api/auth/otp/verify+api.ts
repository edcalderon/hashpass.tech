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
  emailOtp: string;
};

function parseStoredTokenHash(rawTokenHash: string | null | undefined): ParsedTokenHash {
  const fallback: ParsedTokenHash = {
    tokenHash: rawTokenHash?.trim() || '',
    verificationType: 'magiclink',
    emailOtp: '',
  };

  if (!rawTokenHash) return fallback;

  const parts = rawTokenHash.split('::');
  if (parts.length < 2) return fallback;

  const verificationType = parts[0].trim();
  const tokenHash = parts[1].trim();
  const emailOtp = parts.length >= 3 ? parts[2].trim() : '';

  if (!tokenHash) return fallback;

  return {
    tokenHash,
    verificationType: verificationType || 'magiclink',
    emailOtp,
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
        .maybeSingle() as any;

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

    const parsedToken = parseStoredTokenHash((otpData as any).token_hash);
    if (!parsedToken.tokenHash && !parsedToken.emailOtp) {
      return new Response(
        JSON.stringify({ error: 'Invalid verification token payload' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Mark the code as used before touching Supabase auth so it cannot be replayed.
    await supabase
      .from('otp_codes')
      .update({ used: true } as any)
      .eq('email', normalizedEmail)
      .eq('code', normalizedCode)
      .eq('token_hash', (otpData as any).token_hash);

    // Use the stored token_hash directly — admin.generateLink() does not send an email,
    // so the stored token from the OTP send step is still valid and unConsumed.
    // Generating a fresh link here caused GoTrue to return "Only the token_hash and type
    // should be provided" because the JS client attaches extra PKCE fields internally.
    const hostname = hostnameFromRequest(request);
    const { supabaseUrl: anonUrl, supabaseAnonKey: anonKey } = resolvePublicSupabaseConfig({ hostname });

    if (!anonUrl || !anonKey) {
      console.error('OTP verify: missing anon Supabase config for hostname:', hostname);
      return new Response(
        JSON.stringify({ error: 'Server configuration error', code: 'server_config_error' }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const gotrueVerifyUrl = `${anonUrl}/auth/v1/verify`;

    const verificationTypes = Array.from(
      new Set([parsedToken.verificationType, 'magiclink', 'signup', 'email'])
    );

    let verificationResult: { data: any; error: any } | null = null;

    // Build candidate request bodies. GoTrue supports two verify paths:
    //   1. { token_hash, type } — primary: direct hash comparison, no PKCE ambiguity
    //   2. { email, token, type } — fallback: raw email_otp token (GoTrue hashes it server-side)
    // token_hash is tried first because magic links were designed around it and
    // it avoids the "Only the token_hash and type should be provided" validation
    // that older GoTrue versions enforce on other body shapes.
    type VerifyBody =
      | { token_hash: string; type: string }
      | { email: string; token: string; type: string };

    const buildBodies = (type: string): VerifyBody[] => {
      const bodies: VerifyBody[] = [];
      if (parsedToken.tokenHash) {
        bodies.push({ token_hash: parsedToken.tokenHash, type });
      }
      if (parsedToken.emailOtp) {
        bodies.push({ email: normalizedEmail, token: parsedToken.emailOtp, type });
      }
      return bodies;
    };

    outer: for (const type of verificationTypes) {
      for (const body of buildBodies(type)) {
        let res: Response;
        try {
          res = await fetch(gotrueVerifyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
              'Authorization': `Bearer ${anonKey}`,
            },
            body: JSON.stringify(body),
          });
        } catch (fetchErr) {
          verificationResult = { data: null, error: { message: String(fetchErr), code: 'fetch_error' } };
          break outer;
        }

        if (res.ok) {
          const resData = await res.json();
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
          break outer;
        }

        const errData = await res.json().catch(() => ({}));
        const message: string = errData.msg || errData.error_description || errData.message || `status ${res.status}`;
        const isExpired =
          /email link is invalid or has expired/i.test(message) ||
          /otp has expired or is invalid/i.test(message);

        verificationResult = { data: null, error: { message, code: errData.error_code || 'verify_failed' } };
        // Only stop all retries when the token itself is expired/invalid.
        // For any other error (wrong type, unsupported body shape, etc.) keep
        // trying the remaining bodies and types.
        if (isExpired) break outer;
      }
      if (verificationResult?.data) break;
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
        token_hash: parsedToken.tokenHash,
        type: parsedToken.verificationType,
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
