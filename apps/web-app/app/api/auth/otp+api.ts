import { getSupabaseServerEnv, supabaseServer as supabase } from '@/lib/supabase-server';
import * as nodemailer from 'nodemailer';

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
 * API endpoint to send OTP code via custom email
 * Generates OTP token using Supabase Admin API and sends custom email with a 6-digit code
 */
export async function POST(request: Request) {
  try {
    // Check Supabase configuration before proceeding
    const { supabaseUrl, supabaseServiceKey, usingDevFallback, selectedProfile } = getSupabaseServerEnv();

    if (!supabaseUrl || !supabaseServiceKey) {
      const missingVars = [];
      if (!supabaseUrl) {
        missingVars.push(
          'Supabase public URL missing (dev fallback available)'
        );
      }
      if (!supabaseServiceKey) {
        missingVars.push(
          'Supabase service role key missing (dev fallback available)'
        );
      }

      console.error(
        '❌ OTP API: Missing environment variables:',
        missingVars.join(', '),
        '| selectedProfile=',
        selectedProfile,
        '| usingDevFallback=',
        usingDevFallback
      );
      return new Response(
        JSON.stringify({
          error: 'Server configuration error',
          code: 'server_config_error',
          message: 'Authentication service is not properly configured. Please contact support.'
        }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      let supabaseHost = supabaseUrl;
      try {
        supabaseHost = new URL(supabaseUrl).hostname;
      } catch {
        // Keep raw value if URL parsing fails.
      }
      console.log('ℹ️ OTP API Supabase target:', supabaseHost, '| selectedProfile=', selectedProfile);
    }

    // Handle JSON parsing errors
    let body;
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error('Error parsing request body:', parseError);
      return new Response(
        JSON.stringify({
          error: 'Invalid JSON in request body',
          code: 'invalid_json',
          message: 'Please ensure the request body contains valid JSON with an email field.'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const { email, delivery: requestedDelivery, phone } = body || {};
    const delivery = requestedDelivery === 'sms' ? 'sms' : 'email';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Use Supabase Admin API to generate OTP token
    let linkData, linkError;
    try {
      const result = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: email.trim(),
      });
      linkData = result.data;
      linkError = result.error;
    } catch (supabaseError: any) {
      console.error('❌ Supabase connection error:', supabaseError);

      // Check if it's a configuration error
      if (supabaseError?.message?.includes('Missing Supabase environment variables') ||
        supabaseError?.message?.includes('SUPABASE_SERVICE_ROLE_KEY')) {
        return new Response(
          JSON.stringify({
            error: 'Server configuration error',
            code: 'server_config_error',
            message: 'Authentication service is not properly configured. Please contact support.'
          }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Check if it's a network error
      if (supabaseError?.message?.includes('network') ||
        supabaseError?.message?.includes('fetch') ||
        supabaseError?.message?.includes('connection')) {
        return new Response(
          JSON.stringify({
            error: 'Network connection error',
            code: 'network_error',
            message: 'Authentication requires network connection. Please check your internet connection and try again.'
          }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Re-throw to be handled by the error handling below
      linkError = supabaseError;
    }

    if (linkError || !linkData) {
      console.error('Error generating OTP link:', JSON.stringify(linkError, null, 2));

      // Check for rate limit errors specifically - check multiple possible formats
      const errorMessage = linkError?.message || '';
      const errorCode = linkError?.code || '';
      const errorStatus = linkError?.status || 0;

      if (errorMessage.includes('rate limit') ||
        errorMessage.includes('over_email_send_rate_limit') ||
        errorMessage.includes('email rate limit') ||
        errorCode === 'over_email_send_rate_limit' ||
        errorCode === 'rate_limit_exceeded' ||
        errorStatus === 429) {
        console.log('Rate limit detected, returning 429');
        return new Response(
          JSON.stringify({
            error: 'Email rate limit exceeded',
            code: 'over_email_send_rate_limit',
            message: 'Too many emails sent. Please wait a few minutes before requesting another code.'
          }),
          { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Return appropriate status code based on error
      const statusCode = errorStatus === 429 ? 429 : (errorStatus >= 400 && errorStatus < 500 ? errorStatus : 500);

      return new Response(
        JSON.stringify({
          error: errorMessage || 'Failed to generate OTP code',
          code: errorCode || 'unknown_error',
          details: process.env.NODE_ENV === 'development' ? linkError : undefined
        }),
        { status: statusCode, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Extract token hash and verification type from generated link payload.
    const verificationTypeRaw = linkData.properties?.verification_type;
    const verificationType =
      typeof verificationTypeRaw === 'string' && verificationTypeRaw.trim()
        ? verificationTypeRaw.trim()
        : 'magiclink';

    let tokenHash =
      typeof linkData.properties?.hashed_token === 'string'
        ? linkData.properties.hashed_token.trim()
        : '';

    // Backward-compatible fallback: parse from action_link if hashed_token is absent.
    if (!tokenHash && linkData.properties?.action_link) {
      const linkUrl = new URL(linkData.properties.action_link);
      tokenHash =
        linkUrl.searchParams.get('token_hash') ||
        linkUrl.searchParams.get('token') ||
        '';
    }

    if (!tokenHash) {
      console.error('Could not extract token hash from generated link');
      return new Response(
        JSON.stringify({ error: 'Failed to extract OTP token' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Encode verification type with token hash to support multiple GoTrue OTP types
    // without requiring an immediate schema migration.
    const encodedTokenHash = `${verificationType}::${tokenHash}`;

    // Generate a 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Clean up expired OTP codes
    await supabase.rpc('cleanup_expired_otp_codes');

    // Store the mapping in the database (normalize email to lowercase)
    const normalizedEmail = email.trim().toLowerCase();
    const { error: storeError } = await supabase
      .from('otp_codes')
      .insert({
        email: normalizedEmail,
        code: otpCode,
        token_hash: encodedTokenHash,
        expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        used: false,
      } as any);

    if (storeError) {
      console.error('Error storing OTP code:', storeError);
      if (storeError.code === 'PGRST205') {
        return new Response(
          JSON.stringify({
            error: 'OTP storage table is not available in the current Supabase project.',
            code: 'otp_storage_missing_table',
            message: 'The otp_codes table is missing from the active Supabase database. Please contact support.',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'Could not store OTP code',
          code: storeError.code || 'otp_storage_failed',
          message: storeError.message || 'Failed to persist OTP code. Please try again.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Delivery channel:
    // - email (default): send via configured SMTP
    // - sms: send via Brevo transactional SMS API
    if (delivery === 'email') {
      const emailEnabled = process.env.NODEMAILER_HOST &&
        process.env.NODEMAILER_PORT &&
        process.env.NODEMAILER_USER &&
        process.env.NODEMAILER_PASS &&
        process.env.NODEMAILER_FROM;

      if (!emailEnabled) {
        return new Response(
          JSON.stringify({
            error: 'Email service not configured. Please configure NODEMAILER settings.',
            code: 'email_not_configured',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      const smtpHost = process.env.NODEMAILER_HOST || '';
      const isBrevo = smtpHost.includes('brevo.com') || smtpHost.includes('sendinblue.com');

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.NODEMAILER_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.NODEMAILER_USER,
          pass: process.env.NODEMAILER_PASS,
        },
        tls: {
          // For Brevo/Sendinblue, allow hostname mismatch but still verify certificate
          rejectUnauthorized: process.env.NODE_ENV === 'production',
          servername: isBrevo ? 'smtp-relay.sendinblue.com' : undefined,
          checkServerIdentity: isBrevo ? () => undefined : undefined,
        },
        requireTLS: true,
      });

      const mailOptions = {
        from: `HASHPASS <${process.env.NODEMAILER_FROM}>`,
        to: email.trim(),
        subject: `HASHPASS login code: ${otpCode}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5;">One-Time Login Code</h2>
            <p><strong>${otpCode}</strong> is your HASHPASS login code.</p>
            <p>Please enter this code to sign in:</p>
            <div style="background-color: #f3f4f6; border: 2px solid #4f46e5; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #4f46e5; font-size: 32px; letter-spacing: 8px; margin: 0;">${otpCode}</h1>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This code will expire in 1 hour.</p>
            <p style="color: #6b7280; font-size: 14px;">If you didn't request this code, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="font-size: 12px; color: #6b7280;">
              © ${new Date().getFullYear()} HASHPASS. All rights reserved.
            </p>
          </div>
        `,
        text: `${otpCode} is your HASHPASS login code.\n\nPlease enter this code to sign in.\n\nThis code will expire in 1 hour.\n\nIf you didn't request this code, you can safely ignore this email.`,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log('OTP email sent successfully to:', email);
      } catch (emailError: any) {
        console.error('Error sending OTP email:', emailError);

        // Check for rate limit errors from SMTP provider
        if (emailError?.code === 'EENVELOPE' ||
          emailError?.responseCode === 550 ||
          emailError?.message?.includes('rate limit') ||
          emailError?.message?.includes('quota') ||
          emailError?.message?.includes('too many')) {
          return new Response(
            JSON.stringify({
              error: 'Email rate limit exceeded',
              code: 'over_email_send_rate_limit',
              message: 'Too many emails sent. Please wait a few minutes before requesting another code.'
            }),
            { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        return new Response(
          JSON.stringify({
            error: 'Failed to send OTP email',
            code: 'email_send_failed',
            message: emailError?.message || 'Could not send email. Please try again later.'
          }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    } else {
      const brevoApiKey = process.env.BREVO_API_KEY?.trim();
      const sender = (process.env.BREVO_SMS_SENDER || 'HASHPASS').trim().slice(0, 11);
      const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
      const isValidPhone = /^\+[1-9]\d{7,14}$/.test(normalizedPhone);
      const brevoRecipient = normalizedPhone.replace(/^\+/, '');

      if (!isValidPhone) {
        return new Response(
          JSON.stringify({
            error: 'Valid phone is required in E.164 format (example: +573001112233).',
            code: 'invalid_phone',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      if (!brevoApiKey) {
        return new Response(
          JSON.stringify({
            error: 'SMS service is not configured.',
            code: 'sms_not_configured',
            message: 'BREVO_API_KEY is missing on the server.',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      const smsPayload = {
        sender,
        recipient: brevoRecipient,
        content: `HASHPASS login code: ${otpCode}. It expires in 1 hour.`,
        type: 'transactional',
      };

      try {
        // eslint-disable-next-line no-restricted-syntax
        const brevoResponse = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify(smsPayload),
        });

        if (!brevoResponse.ok) {
          const errorBody = await brevoResponse.text().catch(() => '');
          const compact = errorBody.replace(/\s+/g, ' ').slice(0, 300);
          const isRateLimited = brevoResponse.status === 429 || /rate|quota|limit/i.test(compact);

          if (isRateLimited) {
            return new Response(
              JSON.stringify({
                error: 'SMS rate limit exceeded',
                code: 'sms_rate_limited',
                message: 'Too many SMS requests. Please try again in a few minutes.',
              }),
              { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
          }

          return new Response(
            JSON.stringify({
              error: 'Failed to send OTP SMS',
              code: 'sms_send_failed',
              message: compact || `Brevo API returned ${brevoResponse.status}`,
            }),
            { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        console.log('OTP SMS sent successfully to:', normalizedPhone);
      } catch (smsError: any) {
        return new Response(
          JSON.stringify({
            error: 'Failed to send OTP SMS',
            code: 'sms_send_failed',
            message: smsError?.message || 'Could not send SMS. Please try again later.',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        delivery,
        message: delivery === 'sms' ? 'OTP code sent by SMS' : 'OTP code sent to email',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  } catch (error: any) {
    console.error('OTP generation error:', error);

    // Check for rate limit errors in the catch block as well
    if (error?.message?.includes('rate limit') ||
      error?.message?.includes('over_email_send_rate_limit') ||
      error?.code === 'over_email_send_rate_limit' ||
      error?.status === 429) {
      return new Response(
        JSON.stringify({
          error: 'Email rate limit exceeded',
          code: 'over_email_send_rate_limit',
          message: 'Too many emails sent. Please wait a few minutes before requesting another code.'
        }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to send OTP',
        code: error.code || 'unknown_error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}
