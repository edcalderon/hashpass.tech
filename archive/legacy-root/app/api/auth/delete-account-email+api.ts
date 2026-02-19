import { supabaseServer as supabase } from '@/lib/supabase-server';
import nodemailer from 'nodemailer';

/**
 * API endpoint to send account deletion confirmation email
 * Sends a confirmation email to the user after their account has been deleted
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, userName } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if email service is configured
    const emailEnabled = process.env.NODEMAILER_HOST && 
                         process.env.NODEMAILER_PORT && 
                         process.env.NODEMAILER_USER && 
                         process.env.NODEMAILER_PASS && 
                         process.env.NODEMAILER_FROM;

    if (!emailEnabled) {
      console.warn('Email service not configured, skipping deletion confirmation email');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Account deleted (email service not configured)',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
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

    const displayName = userName || email.split('@')[0];
    const deletionDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const mailOptions = {
      from: `HashPass <${process.env.NODEMAILER_FROM}>`,
      to: email.trim(),
      subject: 'Your HashPass Account Has Been Deleted',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="background-color: #F44336; width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <span style="color: #ffffff; font-size: 30px;">✓</span>
              </div>
              <h1 style="color: #1f2937; margin: 0; font-size: 24px;">Account Deletion Confirmed</h1>
            </div>
            
            <div style="color: #4b5563; line-height: 1.6;">
              <p style="margin: 0 0 20px;">Hello ${displayName},</p>
              
              <p style="margin: 0 0 20px;">
                This email confirms that your HashPass account has been successfully deleted on <strong>${deletionDate}</strong>.
              </p>
              
              <div style="background-color: #fef2f2; border-left: 4px solid #F44336; padding: 16px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #991b1b; font-size: 14px;">
                  <strong>What was deleted:</strong>
                </p>
                <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #991b1b; font-size: 14px;">
                  <li>Your user profile and account information</li>
                  <li>All your passes and tickets</li>
                  <li>Meeting requests and schedule</li>
                  <li>All associated data</li>
                </ul>
              </div>
              
              <p style="margin: 20px 0;">
                If you did not request this deletion, please contact our support team immediately at 
                <a href="mailto:support@hashpass.tech" style="color: #4f46e5; text-decoration: none;">support@hashpass.tech</a>.
              </p>
              
              <p style="margin: 20px 0;">
                We're sorry to see you go. If you change your mind, you can create a new account at any time.
              </p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                  This is an automated message. Please do not reply to this email.
                </p>
                <p style="margin: 8px 0 0; font-size: 12px; color: #9ca3af;">
                  © ${new Date().getFullYear()} HashPass. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        </div>
      `,
      text: `Account Deletion Confirmed

Hello ${displayName},

This email confirms that your HashPass account has been successfully deleted on ${deletionDate}.

What was deleted:
- Your user profile and account information
- All your passes and tickets
- Meeting requests and schedule
- All associated data

If you did not request this deletion, please contact our support team immediately at support@hashpass.tech.

We're sorry to see you go. If you change your mind, you can create a new account at any time.

This is an automated message. Please do not reply to this email.

© ${new Date().getFullYear()} HashPass. All rights reserved.`,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('Account deletion confirmation email sent successfully to:', email);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Confirmation email sent',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (emailError: any) {
      console.error('Error sending deletion confirmation email:', emailError);
      // Don't fail the deletion process if email fails
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Account deleted (email sending failed)',
          warning: 'Failed to send confirmation email',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error in deletion email endpoint:', error);
    // Don't fail the deletion process if email fails
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account deleted (email error)',
        warning: error.message || 'Failed to send confirmation email',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

