import { supabaseServer } from '@/lib/supabase-server';
import { sendWelcomeEmailToNewUser } from '@/lib/email';

/**
 * API endpoint to send welcome email to a newly registered user
 * This should be called after a user successfully signs in for the first time
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, email, locale } = body;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Skip welcome email for wallet addresses (synthetic emails)
    if (email.includes('@wallet.')) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Welcome email skipped for wallet address',
          skipped: true
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = supabaseServer;
    
    // Check if welcome email has already been sent (with message_id) - database-level check
    let alreadySent = false;
    try {
      const { data: emailCheck } = await supabase.rpc('has_email_been_sent', {
        p_user_id: userId,
        p_email_type: 'welcome'
      } as any);
      alreadySent = emailCheck === true;
      
      if (alreadySent) {
        console.log(`ℹ️ Welcome email already sent to user ${userId} (${email}), skipping`);
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Welcome email already sent',
            alreadySent: true
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (err) {
      console.warn('⚠️ Error checking welcome email status:', err);
      // Continue to try sending if check fails
    }

    // Reset any tracking record without message_id (from trigger or previous failed attempts)
    // This cleans up records that were created but emails weren't actually sent
    try {
      await supabase.rpc('reset_welcome_email_if_not_sent', {
        p_user_id: userId
      });
      console.log(`✅ Reset welcome email tracking for user ${userId} (cleaned up records without message_id)`);
    } catch (err) {
      console.warn('⚠️ Error resetting welcome email flag:', err);
      // Continue even if reset fails
    }

    // Double-check after reset (in case another request sent it in the meantime)
    try {
      const { data: doubleCheck } = await supabase.rpc('has_email_been_sent', {
        p_user_id: userId,
        p_email_type: 'welcome'
      } as any);
      if (doubleCheck === true) {
        console.log(`ℹ️ Welcome email already sent to user ${userId} (${email}) after reset, skipping`);
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Welcome email already sent',
            alreadySent: true
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (err) {
      console.warn('⚠️ Error in double-check:', err);
    }

    // Validate locale if provided
    let validatedLocale = locale;
    if (validatedLocale && !['en', 'es', 'ko', 'fr', 'pt', 'de'].includes(validatedLocale)) {
      console.warn(`[send-welcome-email API] Invalid locale '${validatedLocale}', defaulting to 'en'`);
      validatedLocale = 'en';
    }
    
    console.log(`[send-welcome-email API] Sending welcome email to ${email} (userId: ${userId}) with locale: ${validatedLocale || 'auto-detect'}`);
    
    // Send welcome email (this will mark it as sent with message_id)
    const result = await sendWelcomeEmailToNewUser(userId, email, validatedLocale);
    
    // Verify message_id was saved
    if (result.success && result.messageId) {
      try {
        const { data: verifyCheck } = await supabase.rpc('has_email_been_sent', {
          p_user_id: userId,
          p_email_type: 'welcome'
        } as any);
        if (verifyCheck === true) {
          console.log(`✅ Verified: Welcome email marked as sent with messageId: ${result.messageId}`);
        } else {
          console.error(`❌ WARNING: Email sent but message_id not saved! messageId: ${result.messageId}`);
        }
      } catch (err) {
        console.warn('⚠️ Error verifying message_id was saved:', err);
      }
    }

    if (result.success) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: result.alreadySent 
            ? 'Welcome email already sent' 
            : 'Welcome email sent successfully',
          alreadySent: result.alreadySent
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: result.error || 'Failed to send welcome email'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error in send-welcome-email API:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

