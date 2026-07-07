import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { sendSubscriptionConfirmation } from '@/lib/email';
import cap from '@/lib/cap-instance';
import { generateUnsubscribeToken } from '@/lib/unsubscribe-token';

export async function POST(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  try {
    // Ensure the request has a JSON content-type
    if (request.headers.get('content-type') !== 'application/json') {
      return new Response(
        JSON.stringify({ error: 'Content-Type must be application/json' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = body?.email?.trim();
    const locale = body?.locale || 'en';
    const captchaToken: string | undefined = body?.captchaToken;

    // Verify captcha token (required)
    if (!captchaToken) {
      return new Response(
        JSON.stringify({ error: 'Captcha verification required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let captchaResult: { success: boolean };
    try {
      captchaResult = await cap.validateToken(captchaToken);
      console.log('[subscribe] captcha validateToken result:', captchaResult);
    } catch (err: any) {
      console.error('[subscribe] captcha validateToken threw:', err?.message || err);
      captchaResult = { success: false };
    }
    if (!captchaResult.success) {
      return new Response(
        JSON.stringify({ error: 'Security check expired. Please solve the captcha again.', captchaExpired: true }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Please enter a valid email address' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { data: existingSubscriber, error: fetchError } = await supabase
      .from('newsletter_subscribers')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (fetchError) {
      console.error('Error checking for existing subscriber:', fetchError);
      throw new Error('Failed to check subscription status');
    }

    if (existingSubscriber) {
      return new Response(
        JSON.stringify({ error: 'This email is already subscribed' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { data, error: insertError } = await supabase
      .from('newsletter_subscribers')
      .insert([{
        email,
        subscribed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        email_sent: false,
      }])
      .select();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      throw new Error('Failed to save subscription');
    }

    const subscriberId = data?.[0]?.id;

    // Build a signed unsubscribe URL so the recipient can opt out with one click
    const unsubscribeToken = generateUnsubscribeToken(email);
    const origin = new URL(request.url).origin;
    const unsubscribeUrl = `${origin}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

    // Send confirmation email and update email_sent flag
    let emailSent = false;
    try {
      const emailResult = await sendSubscriptionConfirmation(email, locale, unsubscribeUrl);
      emailSent = emailResult.success;
      if (!emailResult.success) {
        console.warn('[subscribe] confirmation email failed:', emailResult.error);
      } else {
        console.log('[subscribe] confirmation email sent to', email);
      }
    } catch (emailError) {
      console.error('[subscribe] email threw:', emailError);
    }

    // Record whether the email was actually delivered
    // (requires email_sent column: ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT false)
    if (subscriberId) {
      await supabase
        .from('newsletter_subscribers')
        .update({ email_sent: emailSent })
        .eq('id', subscriberId)
        .then(({ error }) => {
          if (error) console.warn('[subscribe] email_sent update failed:', error.message);
        });
    }

    return new Response(
      JSON.stringify({
        message: emailSent
          ? 'Successfully subscribed! Please check your email for confirmation.'
          : 'Successfully subscribed! (confirmation email could not be sent)',
        subscription: data?.[0] || null,
        emailSent,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    // Log stack trace for server-side debugging, don't expose to client
    if (error instanceof Error && error.stack) {
      console.error('Subscription error:', error.stack);
    } else {
      console.error('Subscription error:', error);
    }
    
    // Determine appropriate status code
    const statusCode = error instanceof Error && 'statusCode' in error 
      ? (error as any).statusCode 
      : 500;
      
    // Get user-friendly error message
    let errorMessage = 'An unexpected error occurred';
    if (error instanceof Error) {
      if (error.message.includes('duplicate key')) {
        errorMessage = 'This email is already subscribed';
      } else if (error.message.includes('connection')) {
        errorMessage = 'Unable to connect to the database';
      } else {
        errorMessage = error.message || errorMessage;
      }
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        code: statusCode
      }),
      { 
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
