import { getSupabaseServerEnv, getSupabaseServerForRequest } from '../../../../lib/supabase-server';
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
 * API endpoint to verify OTP code
 * Maps the user-entered code to the token_hash and verifies it
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
      // Log for debugging
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

    // Mark the code as used before generating the fresh link so it cannot be replayed.
    await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('email', normalizedEmail)
      .eq('code', normalizedCode)
      .eq('token_hash', otpData.token_hash);

    // Generate a fresh single-use magic-link so the client can exchange it for a session
    // using its own anon-key Supabase instance. We never call verifyOtp server-side with
    // the service-role client — GoTrue rejects token_hash verification in that context.
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

    console.log('OTP code verified on server, returning fresh token to client');

    // Sync the user registry in the background — we don't have a session yet (the client
    // will establish it), so look up the user by email to get their ID.
    supabase.auth.admin.getUserByEmail(normalizedEmail).then(({ data: userData }: { data: any }) => {
      if (userData?.user?.id) {
        const u = userData.user;
        syncPublicUserRegistry(request, {
          provider: 'supabase',
          authUserId: u.id,
          email: u.email ?? normalizedEmail,
          firstName: u.user_metadata?.first_name || null,
          lastName: u.user_metadata?.last_name || null,
          fullName: u.user_metadata?.full_name || null,
          avatarUrl: u.user_metadata?.avatar_url || u.user_metadata?.picture || null,
          status: u.user_metadata?.status || 'active',
          emailVerifiedAt: u.email_confirmed_at || u.confirmed_at || null,
          lastSignInAt: u.last_sign_in_at || null,
          authMetadata: u.app_metadata || {},
          profileMetadata: u.user_metadata || {},
          providerIds: { supabase: u.id },
        }).catch(console.error);
      }
    }).catch(console.error);

    return new Response(
      JSON.stringify({
        success: true,
        token_hash: freshTokenHash,
        type: freshVerificationType,
        email: normalizedEmail,
        session: null,
        user: null,
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
