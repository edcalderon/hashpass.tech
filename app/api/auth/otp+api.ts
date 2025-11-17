import { supabaseServer as supabase } from '@/lib/supabase-server';
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
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      const missingVars = [];
      if (!supabaseUrl) missingVars.push('EXPO_PUBLIC_SUPABASE_URL');
      if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');
      
      console.error('❌ OTP API: Missing environment variables:', missingVars.join(', '));
      return new Response(
        JSON.stringify({ 
          error: 'Server configuration error',
          code: 'server_config_error',
          message: 'Authentication service is not properly configured. Please contact support.'
        }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
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
    
    const { email } = body || {};

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

    // Extract token_hash from the generated link
    if (!linkData.properties?.action_link) {
      console.error('Could not extract action_link from generated link');
      return new Response(
        JSON.stringify({ error: 'Failed to extract OTP token' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    
    const linkUrl = new URL(linkData.properties.action_link);
    const tokenHash = linkUrl.searchParams.get('token_hash') || linkUrl.searchParams.get('token');
    
    if (!tokenHash) {
      console.error('Could not extract token from link');
      return new Response(
        JSON.stringify({ error: 'Failed to extract OTP token' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

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
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      } as any);

    if (storeError) {
      console.error('Error storing OTP code:', storeError);
      // Continue anyway - we'll try to verify using the token_hash directly
    }

    // Send custom email with OTP code using nodemailer
    const emailEnabled = process.env.NODEMAILER_HOST && 
                         process.env.NODEMAILER_PORT && 
                         process.env.NODEMAILER_USER && 
                         process.env.NODEMAILER_PASS && 
                         process.env.NODEMAILER_FROM;

    if (emailEnabled) {
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
        from: `HashPass <${process.env.NODEMAILER_FROM}>`,
        to: email.trim(),
        subject: 'Your Login Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5;">One-Time Login Code</h2>
            <p>Please enter this code to sign in:</p>
            <div style="background-color: #f3f4f6; border: 2px solid #4f46e5; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #4f46e5; font-size: 32px; letter-spacing: 8px; margin: 0;">${otpCode}</h1>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This code will expire in 1 hour.</p>
            <p style="color: #6b7280; font-size: 14px;">If you didn't request this code, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="font-size: 12px; color: #6b7280;">
              © ${new Date().getFullYear()} HashPass. All rights reserved.
            </p>
          </div>
        `,
        text: `One-Time Login Code\n\nPlease enter this code to sign in: ${otpCode}\n\nThis code will expire in 1 hour.\n\nIf you didn't request this code, you can safely ignore this email.`,
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
      // If email is not configured, fall back to Supabase's email
      // But this will send a magic link, not an OTP code
      return new Response(
        JSON.stringify({ error: 'Email service not configured. Please configure NODEMAILER settings.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'OTP code sent to email',
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
