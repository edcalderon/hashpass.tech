import { createTransactionalTransport } from './smtp-transport';
import { createOtpCodeHash, createSmsCode } from './sms-auth';
import type { getSupabaseServerForRequest } from '../supabase-server';

export const EMAIL_AUTHENTICATOR_PURPOSE = 'wallet-authenticator-setup';
const CODE_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

const codeHash = (serviceKey: string, email: string, code: string) => createOtpCodeHash({
  serviceKey,
  email,
  code,
  purpose: EMAIL_AUTHENTICATOR_PURPOSE,
});

export function maskAuthenticatorEmail(email: string) {
  const [name, domain] = email.trim().toLowerCase().split('@');
  if (!name || !domain) return 'your account email';
  const visible = name.slice(0, 1);
  return `${visible}${'*'.repeat(Math.min(6, Math.max(2, name.length - 1)))}@${domain}`;
}

export async function sendAuthenticatorEmailCode(
  db: ReturnType<typeof getSupabaseServerForRequest>,
  email: string,
  serviceKey: string,
): Promise<'sent' | 'rate_limited'> {
  const normalizedEmail = email.trim().toLowerCase();
  const latest = await db.from('otp_codes').select('created_at').eq('email', normalizedEmail)
    .eq('purpose', EMAIL_AUTHENTICATOR_PURPOSE).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw new Error('authenticator_unavailable');
  if (latest.data?.created_at && Date.now() - Date.parse(latest.data.created_at) < RESEND_COOLDOWN_MS) {
    return 'rate_limited';
  }

  const code = createSmsCode();
  const retired = await db.from('otp_codes').update({ used: true }).eq('email', normalizedEmail)
    .eq('purpose', EMAIL_AUTHENTICATOR_PURPOSE).eq('used', false);
  if (retired.error) throw new Error('authenticator_unavailable');

  const inserted = await db.from('otp_codes').insert({
    email: normalizedEmail,
    purpose: EMAIL_AUTHENTICATOR_PURPOSE,
    token_hash: 'wallet_email_2fa',
    used: false,
    code_hmac: codeHash(serviceKey, normalizedEmail, code),
    expires_at: new Date(Date.now() + CODE_LIFETIME_MS).toISOString(),
  });
  if (inserted.error) throw new Error('authenticator_unavailable');

  try {
    const { transport, from } = createTransactionalTransport();
    await transport.sendMail({
      from,
      to: normalizedEmail,
      subject: 'Confirm your HASHPASS authenticator setup',
      text: `Your HASHPASS authenticator setup code is ${code}. It expires in 10 minutes and works once. If you did not request this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2>Confirm authenticator setup</h2><p>Enter this code in HASHPASS to finish setting up your authenticator app:</p><div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:20px 0"><h1 style="font-size:32px;letter-spacing:8px;margin:0">${code}</h1></div><p style="color:#6b7280;font-size:14px">It expires in 10 minutes and works once. If you did not request this, ignore this email.</p></div>`,
    });
  } catch {
    await db.from('otp_codes').update({ used: true }).eq('email', normalizedEmail)
      .eq('purpose', EMAIL_AUTHENTICATOR_PURPOSE).eq('used', false);
    throw new Error('authenticator_unavailable');
  }
  return 'sent';
}

export async function verifyAuthenticatorEmailCode(
  db: ReturnType<typeof getSupabaseServerForRequest>,
  email: string,
  serviceKey: string,
  code: string,
): Promise<boolean> {
  const result = await db.rpc('consume_email_otp', {
    p_email: email.trim().toLowerCase(),
    p_code_hmac: codeHash(serviceKey, email.trim().toLowerCase(), code),
    p_purpose: EMAIL_AUTHENTICATOR_PURPOSE,
  });
  if (result.error) throw new Error('authenticator_unavailable');
  return (result.data as { ok?: boolean } | null)?.ok === true;
}
