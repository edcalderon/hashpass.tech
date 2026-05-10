import { getSupabaseServerEnv, supabaseServer as supabase } from '@/lib/supabase-server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

type ParsedTokenHash = {
  tokenHash: string;
  verificationType: string;
};

type SessionPayload = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
  user?: Record<string, any> | null;
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
    const { selectedProfile, usingDevFallback } = getSupabaseServerEnv();

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

    const verificationTypes = Array.from(
      new Set([parsedToken.verificationType, 'magiclink', 'signup', 'email'])
    );

    let verificationResult: {
      data: { session: SessionPayload | null; user: Record<string, any> | null } | null;
      error: any;
    } | null = null;

    for (const type of verificationTypes) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: parsedToken.tokenHash,
        type: type as any,
        email: normalizedEmail,
      } as any);

      if (!error) {
        verificationResult = { data, error: null };
        break;
      }

      const message = typeof error.message === 'string' ? error.message : '';
      const canRetryWithAnotherType =
        /email link is invalid or has expired/i.test(message) ||
        /otp has expired or is invalid/i.test(message);

      if (!canRetryWithAnotherType) {
        verificationResult = { data: null, error };
        break;
      }

      verificationResult = { data: null, error };
    }

    if (!verificationResult || verificationResult.error) {
      const errorMessage = verificationResult?.error?.message || 'Failed to verify OTP';
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

    // Mark the code as used only after the Supabase session is created successfully.
    await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('email', normalizedEmail)
      .eq('code', normalizedCode)
      .eq('token_hash', otpData.token_hash);

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
