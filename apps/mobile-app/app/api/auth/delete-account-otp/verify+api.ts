import {
  getSupabaseServerEnv,
  getSupabaseServerForRequest,
} from '@/lib/supabase-server';
import { createOtpCodeHash } from '@/lib/server/sms-auth';

/**
 * API endpoint to verify OTP code for account deletion
 * Verifies the code and marks it as used
 */
export async function POST(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  try {
    const body = await request.json();
    const { email, code } = body;

    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: 'Email and code are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { supabaseServiceKey } = getSupabaseServerEnv(request);
    if (!supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Authentication service unavailable' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.toString().trim();

    // Clean up expired OTP codes
    await supabase.rpc('cleanup_expired_otp_codes');

    const { data: otpData, error: consumeError } = await supabase.rpc(
      'consume_email_otp',
      {
        p_email: normalizedEmail,
        p_code_hmac: createOtpCodeHash({
          serviceKey: supabaseServiceKey,
          email: normalizedEmail,
          code: normalizedCode,
          purpose: 'account-delete',
        }),
        p_purpose: 'account-delete',
      },
    );

    if (consumeError) {
      console.error('OTP consume error:', consumeError);
      return new Response(
        JSON.stringify({ error: 'Authentication service unavailable' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!otpData?.ok) {
      return new Response(
        JSON.stringify({ error: 'Invalid verification code' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
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
