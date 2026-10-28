import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import cap from '@/lib/cap-instance';
import { rateLimitOk } from '@/lib/bsl/rateLimit';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`lukas-subscribe:ip:${ip}`)) return json({ error: 'Too many requests' }, 429);
  if (request.headers.get('content-type') !== 'application/json') {
    return json({ error: 'Content-Type must be application/json' }, 400);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const hashpassOptIn = body?.hashpassOptIn === true;
    const captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken.trim() : '';
    const source = typeof body?.source === 'string' && body.source.trim()
      ? body.source.trim().slice(0, 80)
      : 'lukas_landing';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Please enter a valid email address' }, 400);
    }
    if (!captchaToken || captchaToken.length > 2_048) {
      return json({ error: 'Security check required. Please solve the captcha again.', captchaExpired: true }, 400);
    }
    let captchaValid = false;
    try {
      captchaValid = (await cap.validateToken(captchaToken)).success;
    } catch (captchaError) {
      console.error('[lukas/subscribe] captcha validation failed:', captchaError);
    }
    if (!captchaValid) {
      return json({ error: 'Security check expired. Please solve the captcha again.', captchaExpired: true }, 400);
    }

    const supabase = getSupabaseServerForRequest(request);
    const { data: existingLukas, error: lookupError } = await supabase
      .from('lukas_newsletter_subscribers')
      .select('email, hashpass_opt_in')
      .eq('email', email)
      .maybeSingle();

    if (lookupError) {
      console.error('[lukas/subscribe] lookup error:', lookupError);
      return json({ error: 'Unable to save your subscription right now' }, 503);
    }

    if (!existingLukas) {
      const { error: insertError } = await supabase
        .from('lukas_newsletter_subscribers')
        .insert([{ email, source, hashpass_opt_in: hashpassOptIn }]);
      if (insertError && insertError.code !== '23505') {
        console.error('[lukas/subscribe] insert error:', insertError);
        return json({ error: 'Unable to save your subscription right now' }, 503);
      }
    } else if (hashpassOptIn && !existingLukas.hashpass_opt_in) {
      const { error: updateError } = await supabase
        .from('lukas_newsletter_subscribers')
        .update({ hashpass_opt_in: true, updated_at: new Date().toISOString() })
        .eq('email', email);
      if (updateError) console.warn('[lukas/subscribe] opt-in update failed:', updateError);
    }

    if (hashpassOptIn) {
      const { data: existingHashpass, error: hashpassLookupError } = await supabase
        .from('newsletter_subscribers')
        .select('email')
        .eq('email', email)
        .maybeSingle();
      if (hashpassLookupError) {
        console.warn('[lukas/subscribe] HashPass lookup failed:', hashpassLookupError);
      } else if (!existingHashpass) {
        const { error: hashpassInsertError } = await supabase
          .from('newsletter_subscribers')
          .insert([{ email, subscribed_at: new Date().toISOString(), created_at: new Date().toISOString(), email_sent: false }]);
        if (hashpassInsertError && hashpassInsertError.code !== '23505') {
          console.warn('[lukas/subscribe] HashPass opt-in copy failed:', hashpassInsertError);
        }
      }
    }

    return json({
      success: true,
      alreadySubscribed: Boolean(existingLukas),
      hashpassOptIn,
      message: 'You are subscribed to Lukas updates.',
    }, existingLukas ? 200 : 201);
  } catch (error) {
    console.error('[lukas/subscribe] unhandled error:', error);
    return json({ error: 'Unable to save your subscription right now' }, 500);
  }
}
