import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { sendSubscriptionConfirmation, SUPPORTED_LOCALES } from '@/lib/email';
import cap from '@/lib/cap-instance';
import { generateUnsubscribeToken } from '@/lib/unsubscribe-token';

// The client (Newsletter.tsx / Newsletter.web.tsx) already auto-detects the
// device/browser locale and sends it explicitly, so this is only a fallback
// for a caller that omits it -- parses the standard Accept-Language header
// (e.g. "es-CO,es;q=0.9,en;q=0.8") and picks the first tag whose base
// language this app actually has a confirmation email translated for.
function resolveLocaleFromRequest(bodyLocale: unknown, request: Request): string {
  if (typeof bodyLocale === 'string' && SUPPORTED_LOCALES.includes(bodyLocale)) {
    return bodyLocale;
  }
  const acceptLanguage = request.headers.get('accept-language') || '';
  for (const part of acceptLanguage.split(',')) {
    const lang = part.trim().split(';')[0].split('-')[0].toLowerCase();
    if (SUPPORTED_LOCALES.includes(lang)) return lang;
  }
  return 'en';
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  try {
    if (request.headers.get('content-type') !== 'application/json') {
      return json({ error: 'Content-Type must be application/json' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const email: string = (body?.email ?? '').trim();
    const locale: string = resolveLocaleFromRequest(body?.locale, request);
    const captchaToken: string | undefined = body?.captchaToken;
    // Native clients send source:'native' or omit captchaToken entirely
    const isNative: boolean = body?.source === 'native' || !captchaToken;

    if (!email) return json({ error: 'Email is required' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Please enter a valid email address' }, 400);
    }

    // Check duplicate BEFORE captcha so already-subscribed users always get
    // the correct message, whether on web or native.
    const { data: existing, error: fetchError } = await supabase
      .from('newsletter_subscribers')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (fetchError) {
      console.error('[subscribe] duplicate check error:', fetchError);
      throw new Error('Failed to check subscription status');
    }

    if (existing) {
      return json({ error: 'This email is already subscribed', alreadySubscribed: true }, 400);
    }

    // Captcha required on web only
    if (!isNative) {
      let captchaResult: { success: boolean };
      try {
        captchaResult = await cap.validateToken(captchaToken!);
        console.log('[subscribe] captcha validateToken result:', captchaResult);
      } catch (err: any) {
        console.error('[subscribe] captcha validateToken threw:', err?.message || err);
        captchaResult = { success: false };
      }
      if (!captchaResult.success) {
        return json({ error: 'Security check expired. Please solve the captcha again.', captchaExpired: true }, 400);
      }
    }

    // Do not request the inserted row back. The newsletter RLS policy permits
    // public inserts but intentionally does not permit public reads; PostgREST
    // treats `.select()` here as INSERT ... RETURNING and rejects it for an
    // anonymous server credential.
    const { error: insertError } = await supabase
      .from('newsletter_subscribers')
      .insert([{ email, subscribed_at: new Date().toISOString(), created_at: new Date().toISOString(), email_sent: false }]);

    if (insertError) {
      console.error('[subscribe] insert error:', insertError);
      if (insertError.code === '23505') {
        return json({ error: 'This email is already subscribed', alreadySubscribed: true }, 400);
      }
      throw new Error('Failed to save subscription');
    }

    const origin = new URL(request.url).origin;
    const unsubscribeUrl = `${origin}/api/unsubscribe?token=${encodeURIComponent(generateUnsubscribeToken(email))}`;

    let emailSent = false;
    try {
      const result = await sendSubscriptionConfirmation(email, locale, unsubscribeUrl);
      emailSent = result.success;
      if (!result.success) console.warn('[subscribe] email failed:', result.error);
      else console.log('[subscribe] email sent to', email);
    } catch (emailError) {
      console.error('[subscribe] email threw:', emailError);
    }

    await supabase
      .from('newsletter_subscribers')
      .update({ email_sent: emailSent })
      .eq('email', email)
      .then(({ error: e }: { error?: { message?: string } | null }) => {
        if (e) console.warn('[subscribe] email_sent update failed:', e.message);
      });

    return json({
      success: true,
      message: emailSent
        ? 'Successfully subscribed! Please check your email for confirmation.'
        : 'Successfully subscribed! (confirmation email could not be sent)',
      emailSent,
    }, 201);
  } catch (error) {
    if (error instanceof Error && error.stack) {
      console.error('[subscribe] unhandled error:', error.stack);
    } else {
      console.error('[subscribe] unhandled error:', error);
    }
    let errorMessage = 'An unexpected error occurred';
    if (error instanceof Error) {
      if (error.message.includes('duplicate key')) errorMessage = 'This email is already subscribed';
      else errorMessage = error.message;
    }
    return json({ error: errorMessage }, 500);
  }
}

function json(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
