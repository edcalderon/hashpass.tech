import { supabaseServer as supabase } from '@/lib/supabase-server';

/**
 * API endpoint to verify OTP code for account deletion
 * Verifies the code and marks it as used
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, code } = body;

    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: 'Email and code are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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
      .like('token_hash', 'delete_account_%')
      .maybeSingle();

    if (lookupError) {
      console.error('OTP lookup error:', lookupError);
      return new Response(
        JSON.stringify({ 
          error: 'Database error while verifying code',
          details: lookupError.message 
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!otpData) {
      // Log for debugging
      console.log('OTP code not found or invalid:', { email: email.trim(), code: code.toString() });
      
      // Check if code was already used
      const { data: usedData } = await supabase
        .from('otp_codes')
        .select('used')
        .eq('email', email.trim().toLowerCase())
        .eq('code', code.toString().trim())
        .maybeSingle();
      
      if (usedData?.used) {
        return new Response(
          JSON.stringify({ error: 'This verification code has already been used' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Invalid verification code' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Mark the code as used
    const { error: updateError } = await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('email', email.trim().toLowerCase())
      .eq('code', code.toString().trim());

    if (updateError) {
      console.error('Error marking OTP as used:', updateError);
      // Don't fail the request, just log the error
    }

    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        message: 'Verification code confirmed',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('OTP verification error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to verify OTP' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

