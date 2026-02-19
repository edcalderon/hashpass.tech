import { supabaseServer } from '@/lib/supabase-server';
import { sendUserOnboardingEmail, sendSpeakerOnboardingEmail, detectUserLocale } from '@/lib/email';

/**
 * API endpoint to send onboarding emails to a newly registered user
 * This should be called after welcome email is sent
 * - Sends user onboarding email to all users
 * - Sends speaker onboarding email if user is a speaker
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

    // Skip onboarding emails for wallet addresses (synthetic emails)
    if (email.includes('@wallet.')) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Onboarding emails skipped for wallet address',
          skipped: true
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = supabaseServer;
    const results: {
      userOnboarding?: { success: boolean; alreadySent?: boolean; error?: string };
      speakerOnboarding?: { success: boolean; alreadySent?: boolean; error?: string; isSpeaker?: boolean };
    } = {};

    // Detect user locale from database if not provided
    let detectedLocale = locale;
    if (!detectedLocale) {
      console.log(`[send-onboarding-emails API] No locale provided, detecting for user ${userId}`);
      detectedLocale = await detectUserLocale(userId);
    } else {
      console.log(`[send-onboarding-emails API] Using provided locale: ${detectedLocale} for user ${userId}`);
    }
    
    // Validate locale is supported
    const SUPPORTED_LOCALES = ['en', 'es', 'ko', 'fr', 'pt', 'de'];
    if (!SUPPORTED_LOCALES.includes(detectedLocale)) {
      console.warn(`[send-onboarding-emails API] Invalid locale '${detectedLocale}', defaulting to 'en'`);
      detectedLocale = 'en';
    }
    
    console.log(`[send-onboarding-emails API] Sending onboarding emails to ${email} (userId: ${userId}) with locale: ${detectedLocale}`);

    // Check if user onboarding email has already been sent (with message_id) - database-level check
    let userOnboardingAlreadySent = false;
    try {
      const { data: userOnboardingCheck } = await supabase.rpc('has_email_been_sent', {
        p_user_id: userId,
        p_email_type: 'userOnboarding'
      } as any);
      userOnboardingAlreadySent = userOnboardingCheck === true;
      
      if (userOnboardingAlreadySent) {
        console.log(`ℹ️ User onboarding email already sent to user ${userId} (${email}), skipping`);
        results.userOnboarding = { success: true, alreadySent: true };
      }
    } catch (err) {
      console.warn('⚠️ Error checking user onboarding email status:', err);
      // Continue to try sending if check fails
    }

    // 1. Send user onboarding email to all users (only if not already sent)
    if (!userOnboardingAlreadySent) {
      console.log(`📧 Sending user onboarding email to ${email} with locale: ${detectedLocale}...`);
      const userOnboardingResult = await sendUserOnboardingEmail(email, detectedLocale, userId);
      results.userOnboarding = userOnboardingResult;
    } else if (!results.userOnboarding) {
      // Ensure result is set if check passed but result wasn't set
      results.userOnboarding = { success: true, alreadySent: true };
    }

    // 2. Check if user is a speaker
    const { data: speakerData, error: speakerError } = await supabase
      .from('bsl_speakers')
      .select('id, name')
      .eq('user_id', userId)
      .maybeSingle();

    const isSpeaker = !speakerError && speakerData !== null;
    const speakerName = (speakerData as any)?.name;

    // 3. Send speaker onboarding email if user is a speaker (only if not already sent)
    if (isSpeaker) {
      // Check if speaker onboarding email has already been sent
      let speakerOnboardingAlreadySent = false;
      try {
        const { data: speakerOnboardingCheck } = await supabase.rpc('has_email_been_sent', {
          p_user_id: userId,
          p_email_type: 'speakerOnboarding'
        } as any);
        speakerOnboardingAlreadySent = speakerOnboardingCheck === true;
      } catch (err) {
        console.warn('⚠️ Error checking speaker onboarding email status:', err);
      }

      if (speakerOnboardingAlreadySent) {
        console.log(`ℹ️ Speaker onboarding email already sent to user ${userId}, skipping`);
        results.speakerOnboarding = {
          success: true,
          isSpeaker: true,
          alreadySent: true
        };
      } else {
        console.log(`🎤 User ${userId} is a speaker (${speakerName}), sending speaker onboarding email with locale: ${detectedLocale}...`);
        const speakerOnboardingResult = await sendSpeakerOnboardingEmail(email, detectedLocale, userId);
        results.speakerOnboarding = {
          ...speakerOnboardingResult,
          isSpeaker: true
        };
      }
    } else {
      console.log(`ℹ️ User ${userId} is not a speaker, skipping speaker onboarding email`);
      results.speakerOnboarding = {
        success: true,
        isSpeaker: false,
        alreadySent: false
      };
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Onboarding emails processed',
        results
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in send-onboarding-emails API:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

