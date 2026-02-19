import { supabaseServer as supabase } from '@/lib/supabase-server';
import nodemailer from 'nodemailer';

/**
 * API endpoint to send OTP code for account deletion verification
 * Generates OTP token and sends custom email with a 6-digit code
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate a 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Clean up expired OTP codes
    await supabase.rpc('cleanup_expired_otp_codes');
    
    // Store the mapping in the database (normalize email to lowercase)
    const normalizedEmail = email.trim().toLowerCase();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Expires in 1 hour
    
    const { error: storeError } = await supabase
      .from('otp_codes')
      .insert({
        email: normalizedEmail,
        code: otpCode,
        token_hash: `delete_account_${Date.now()}`, // Special token for account deletion
        expires_at: expiresAt.toISOString(),
        used: false,
      });

    if (storeError) {
      console.error('Error storing OTP code:', storeError);
      return new Response(
        JSON.stringify({ error: 'Failed to store OTP code' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send custom email with OTP code using nodemailer
    if (process.env.NODEMAILER_FROM && process.env.NODEMAILER_PASS) {
      const smtpHost = process.env.NODEMAILER_HOST || 'smtp.sendgrid.net';
      const isBrevo = smtpHost.includes('brevo.com') || smtpHost.includes('sendinblue.com');
      
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.NODEMAILER_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.NODEMAILER_USER || 'apikey',
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
        subject: 'Account Deletion Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #F44336;">Account Deletion Verification</h2>
            <p>You have requested to delete your HashPass account. Please enter this verification code to confirm:</p>
            <div style="background-color: #f3f4f6; border: 2px solid #F44336; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #F44336; font-size: 32px; letter-spacing: 8px; margin: 0;">${otpCode}</h1>
            </div>
            <p style="color: #6b7280; font-size: 14px;"><strong>Warning:</strong> This action cannot be undone. All your data will be permanently deleted.</p>
            <p style="color: #6b7280; font-size: 14px;">This code will expire in 1 hour.</p>
            <p style="color: #6b7280; font-size: 14px;">If you didn't request this code, please ignore this email and secure your account.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="font-size: 12px; color: #6b7280;">
              © ${new Date().getFullYear()} HashPass. All rights reserved.
            </p>
          </div>
        `,
        text: `Account Deletion Verification\n\nYou have requested to delete your HashPass account. Please enter this verification code to confirm: ${otpCode}\n\nWarning: This action cannot be undone. All your data will be permanently deleted.\n\nThis code will expire in 1 hour.\n\nIf you didn't request this code, please ignore this email and secure your account.`,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log('Account deletion OTP email sent successfully to:', email);
      } catch (emailError: any) {
        console.error('Error sending OTP email:', emailError);
        return new Response(
          JSON.stringify({ error: 'Failed to send OTP email' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // If email is not configured, return error
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'OTP code sent to email',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('OTP generation error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to send OTP' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

