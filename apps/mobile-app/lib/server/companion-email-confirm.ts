import { createHmac, timingSafeEqual } from 'crypto';
import { createOtpCodeHash, createSmsCode } from './sms-auth';
import { createTransactionalTransport } from './smtp-transport';

export const CONFIRM_PURPOSE = 'companion-email-confirm';
export const CONFIRM_CODE_PATTERN = /^\d{6}$/;
export const CONFIRM_RESEND_COOLDOWN_MS = 60 * 1000;
export const CONFIRM_MAX_SENDS_PER_HOUR = 5;
export const CONFIRM_CODE_TTL_MINUTES = 10;
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const COMPANION_ORIGINS = ['https://companion.hashpass.tech', 'https://companion-dev.hashpass.tech', 'http://localhost:5173'];
const DEFAULT_ORIGIN = COMPANION_ORIGINS[0];
const LOCALES = ['en', 'es', 'ja'];

export const normalizeConfirmEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 320 && EMAIL_PATTERN.test(email) ? email : null;
};

export const confirmCodeHash = (serviceKey: string, email: string, code: string) =>
  createOtpCodeHash({ serviceKey, email, code, purpose: CONFIRM_PURPOSE });

export { createSmsCode as createConfirmCode };
export const confirmCodeExpiry = (now = Date.now()) => new Date(now + CONFIRM_CODE_TTL_MINUTES * 60 * 1000).toISOString();

const sign = (serviceKey: string, encodedEmail: string) =>
  createHmac('sha256', serviceKey).update(`hashpass:companion-confirm-link:v1:${encodedEmail}`).digest('base64url');

/**
 * The confirmation link carries no expiry on purpose: it is a signature over the email, so it
 * keeps working for as long as the person keeps the message, and confirming twice is harmless.
 * Only the six-digit code expires. Rotating the server secret revokes every outstanding link.
 */
export function createConfirmToken(serviceKey: string, email: string): string {
  const encoded = Buffer.from(email, 'utf8').toString('base64url');
  return `${encoded}.${sign(serviceKey, encoded)}`;
}

/** Returns the confirmed email, or null for any malformed or forged token. */
export function verifyConfirmToken(serviceKey: string, token: unknown): string | null {
  if (typeof token !== 'string' || token.length > 600) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(sign(serviceKey, parts[0]));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return normalizeConfirmEmail(Buffer.from(parts[0], 'base64url').toString('utf8'));
}

/** Only a known Companion origin may be linked to, so the Origin header cannot redirect the link elsewhere. */
export const resolveCompanionOrigin = (origin: string | null): string =>
  origin && COMPANION_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGIN;

export const buildConfirmLink = (origin: string, token: string) => `${origin}/?confirm=${encodeURIComponent(token)}`;

const COPY: Record<string, { subject: string; heading: string; intro: string; codeNote: string; linkLabel: string; linkNote: string; ignore: string }> = {
  en: {
    subject: 'Confirm your HASHPASS Companion email',
    heading: 'Confirm your email',
    intro: 'Enter this code in your Companion, or use the button below.',
    codeNote: `The code expires in ${CONFIRM_CODE_TTL_MINUTES} minutes.`,
    linkLabel: 'Confirm my email',
    linkNote: 'This link does not expire, so you can confirm any time.',
    ignore: 'If you did not set up a Companion, ignore this message.',
  },
  es: {
    subject: 'Confirma tu correo de HASHPASS Companion',
    heading: 'Confirma tu correo',
    intro: 'Escribe este código en tu Companion o usa el botón de abajo.',
    codeNote: `El código caduca en ${CONFIRM_CODE_TTL_MINUTES} minutos.`,
    linkLabel: 'Confirmar mi correo',
    linkNote: 'Este enlace no caduca, así que puedes confirmar cuando quieras.',
    ignore: 'Si no configuraste un Companion, ignora este mensaje.',
  },
  ja: {
    subject: 'HASHPASS Companion のメールを確認してください',
    heading: 'メールアドレスの確認',
    intro: 'このコードを Companion に入力するか、下のボタンを使ってください。',
    codeNote: `コードの有効期限は${CONFIRM_CODE_TTL_MINUTES}分です。`,
    linkLabel: 'メールを確認する',
    linkNote: 'このリンクには有効期限がないので、いつでも確認できます。',
    ignore: 'Companion を設定した覚えがない場合は、このメッセージを無視してください。',
  },
};

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const pickConfirmLocale = (value: unknown) => (typeof value === 'string' && LOCALES.includes(value) ? value : 'en');

/** Sends the code and the permanent link in one message over the shared SMTP relay. Never logs either. */
export async function sendConfirmEmail(to: string, code: string, link: string, locale: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const copy = COPY[pickConfirmLocale(locale)];
  const { transport, from } = createTransactionalTransport(env);
  await transport.sendMail({
    from, to, subject: copy.subject,
    text: `${copy.intro}\n\n${code}\n${copy.codeNote}\n\n${copy.linkLabel}: ${link}\n${copy.linkNote}\n\n${copy.ignore}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2>${copy.heading}</h2><p>${copy.intro}</p><div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:20px 0"><h1 style="font-size:32px;letter-spacing:8px;margin:0">${code}</h1></div><p style="color:#6b7280;font-size:14px">${copy.codeNote}</p><p style="text-align:center;margin:24px 0"><a href="${escapeHtml(link)}" style="background:#0e7490;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">${copy.linkLabel}</a></p><p style="color:#6b7280;font-size:14px">${copy.linkNote}</p><p style="color:#6b7280;font-size:14px">${copy.ignore}</p></div>`,
  });
}
