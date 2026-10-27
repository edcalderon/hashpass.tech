import { getSupabaseServerEnv, getSupabaseServerForRequest } from '../../../lib/supabase-server';
import {
  CONFIRM_CODE_PATTERN, CONFIRM_MAX_SENDS_PER_HOUR, CONFIRM_PURPOSE, CONFIRM_RESEND_COOLDOWN_MS,
  buildConfirmLink, confirmCodeExpiry, confirmCodeHash, createConfirmCode, createConfirmToken,
  normalizeConfirmEmail, pickConfirmLocale, resolveCompanionOrigin, sendConfirmEmail, verifyConfirmToken,
} from '../../../lib/server/companion-email-confirm';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (error: string, status: number) => reply({ error }, status);

/**
 * POST { action: 'send', email, locale? }   email a six-digit code (10 minutes) and a permanent link
 * POST { action: 'verify-code', email, code }  consume the code
 * POST { action: 'verify-link', token }        check the link signature
 *
 * Confirming is optional: nothing here creates an account or a session. The reply only tells
 * the Companion which email has been proven, and it keeps that fact locally. Verifying the
 * link is a POST made by the Companion page, not a GET, so mail scanners that prefetch links
 * cannot confirm an address on someone's behalf. Messages are generic; codes are never logged.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const env = getSupabaseServerEnv(request);
    if (!env.supabaseServiceKey) return failure('confirmation_unavailable', 503);

    let body: Record<string, unknown>;
    try {
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error();
      const text = await request.text();
      if (text.length > 1024) throw new Error();
      body = JSON.parse(text);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    } catch { return failure('invalid_confirmation_request', 400); }
    const only = (...keys: string[]) => Object.keys(body).every(key => keys.includes(key));

    if (body.action === 'verify-link' && only('action', 'token')) {
      const email = verifyConfirmToken(env.supabaseServiceKey, body.token);
      return email ? reply({ confirmed: true, email }) : failure('confirmation_invalid', 403);
    }

    const email = normalizeConfirmEmail(body.email);
    if (!email) return failure('invalid_confirmation_request', 400);
    const db = getSupabaseServerForRequest(request);

    if (body.action === 'send' && only('action', 'email', 'locale')) {
      const recent = await db.from('otp_codes').select('created_at').eq('email', email).eq('purpose', CONFIRM_PURPOSE)
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false }).limit(CONFIRM_MAX_SENDS_PER_HOUR);
      if (recent.error) return failure('confirmation_unavailable', 503);
      const rows = (recent.data ?? []) as { created_at?: string }[];
      const latest = rows[0]?.created_at;
      if (rows.length >= CONFIRM_MAX_SENDS_PER_HOUR || (latest && Date.now() - Date.parse(latest) < CONFIRM_RESEND_COOLDOWN_MS)) {
        return failure('confirmation_rate_limited', 429);
      }
      const code = createConfirmCode();
      await db.from('otp_codes').update({ used: true }).eq('email', email).eq('purpose', CONFIRM_PURPOSE).eq('used', false);
      const stored = await db.from('otp_codes').insert({
        email, purpose: CONFIRM_PURPOSE, token_hash: 'companion_email_confirm', used: false,
        code_hmac: confirmCodeHash(env.supabaseServiceKey, email, code), expires_at: confirmCodeExpiry(),
      });
      if (stored.error) return failure('confirmation_unavailable', 503);
      const link = buildConfirmLink(resolveCompanionOrigin(request.headers.get('Origin')), createConfirmToken(env.supabaseServiceKey, email));
      try { await sendConfirmEmail(email, code, link, pickConfirmLocale(body.locale)); } catch { return failure('confirmation_unavailable', 503); }
      return reply({ sent: true });
    }

    if (body.action === 'verify-code' && only('action', 'email', 'code')) {
      if (typeof body.code !== 'string' || !CONFIRM_CODE_PATTERN.test(body.code)) return failure('invalid_confirmation_request', 400);
      const result = await db.rpc('consume_email_otp', {
        p_email: email, p_code_hmac: confirmCodeHash(env.supabaseServiceKey, email, body.code), p_purpose: CONFIRM_PURPOSE,
      });
      if (result.error) return failure('confirmation_unavailable', 503);
      const outcome = result.data as { ok?: boolean; reason?: string } | null;
      if (outcome?.ok !== true) return failure(outcome?.reason === 'locked' ? 'confirmation_locked' : 'confirmation_invalid', outcome?.reason === 'locked' ? 429 : 403);
      return reply({ confirmed: true, email });
    }
    return failure('invalid_confirmation_request', 400);
  } catch { return failure('confirmation_unavailable', 503); }
}
