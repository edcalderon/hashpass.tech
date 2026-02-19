import { supabaseServer as supabase } from '@/lib/supabase-server';
import { sendSubscriptionConfirmation } from '@/lib/email';

export async function POST(request: Request) {
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
    const locale = body?.locale || 'en'; // Default to English if locale not provided

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
        created_at: new Date().toISOString() 
      }])
      .select();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      throw new Error('Failed to save subscription');
    }

    // Send confirmation email
    let emailResult;
    try {
      emailResult = await sendSubscriptionConfirmation(email, locale);
      
      if (!emailResult.success) {
        console.warn('Email notification warning:', emailResult.error);
        // Continue with success response but indicate email wasn't sent
        return new Response(
          JSON.stringify({ 
            message: 'Successfully subscribed! However, we encountered an issue sending your confirmation email.',
            warning: emailResult.error,
            subscription: data?.[0] || null,
            emailSent: false
          }),
          { 
            status: 201,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      // Success case with email sent
      return new Response(
        JSON.stringify({ 
          message: 'Successfully subscribed! Please check your email for confirmation.', 
          subscription: data?.[0] || null,
          emailSent: true
        }),
        { 
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      // Still return success since subscription was saved, but indicate email failed
      return new Response(
        JSON.stringify({ 
          message: 'Successfully subscribed! However, we encountered an issue sending your confirmation email.',
          warning: 'Could not send confirmation email',
          subscription: data?.[0] || null,
          emailSent: false
        }),
        { 
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
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
