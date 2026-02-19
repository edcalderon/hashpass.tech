import { supabaseServer as supabase } from '@/lib/supabase-server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

    // Look up the token_hash from the code
    const { data: otpData, error: lookupError } = await supabase
      .from('otp_codes')
      .select('token_hash, used, expires_at, email')
      .eq('email', email.trim().toLowerCase())
      .eq('code', code.toString().trim())
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
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
      console.log('OTP code not found:', { email: email.trim(), code: code.toString() });
      
      // Check if code exists but is used or expired
      const { data: expiredData } = await supabase
        .from('otp_codes')
        .select('used, expires_at')
        .eq('email', email.trim().toLowerCase())
        .eq('code', code.toString().trim())
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

    // Mark the code as used
    await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('email', email.trim().toLowerCase())
      .eq('code', code.toString().trim());

    // Return the token_hash to the client so it can verify using the client-side Supabase client
    // The client-side client has the proper permissions to verify OTP tokens
    console.log('OTP code verified, returning token_hash for client-side verification');
    
    return new Response(
      JSON.stringify({ 
        success: true,
        token_hash: otpData.token_hash,
        email: email.trim().toLowerCase(),
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

