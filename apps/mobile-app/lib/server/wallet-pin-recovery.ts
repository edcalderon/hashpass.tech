import nodemailer from 'nodemailer';
import { createOtpCodeHash, createSmsCode } from './sms-auth';

export const RECOVERY_PURPOSE = 'wallet-pin-reset';
export const RECOVERY_CODE_PATTERN = /^\d{6}$/;
const EXPIRY_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;

export const recoveryCodeHash = (serviceKey: string, email: string, code: string) =>
  createOtpCodeHash({ serviceKey, email, code, purpose: RECOVERY_PURPOSE });

export { createSmsCode as createRecoveryCode };
export const recoveryExpiry = (now = Date.now()) => new Date(now + EXPIRY_MS).toISOString();

/** Delivers the code over the same SMTP relay the login and deletion codes use. Never logs it. */
export async function sendRecoveryEmail(to: string, code: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!env.NODEMAILER_FROM || !env.NODEMAILER_PASS) throw new Error('email_unavailable');
  const host = env.NODEMAILER_HOST || 'smtp.sendgrid.net';
  const name = host.trim().toLowerCase().replace(/\.$/, '').split(':')[0];
  const brevo = name === 'brevo.com' || name.endsWith('.brevo.com') || name === 'sendinblue.com' || name.endsWith('.sendinblue.com');
  const transporter = nodemailer.createTransport({
    host, port: parseInt(env.NODEMAILER_PORT || '587'), secure: false, requireTLS: true,
    auth: { user: env.NODEMAILER_USER || 'apikey', pass: env.NODEMAILER_PASS },
    // Brevo edges serve different relay certs (legacy sendinblue.com names
    // or brevo.com names), so no single hostname validates everywhere; keep
    // the CA chain check, skip the hostname match.
    tls: { rejectUnauthorized: env.NODE_ENV === 'production', ...(brevo ? { checkServerIdentity: () => undefined } : {}) },
  });
  await transporter.sendMail({
    from: `HASHPASS <${env.NODEMAILER_FROM}>`, to,
    subject: 'Your HASHPASS wallet PIN reset code',
    text: `Your wallet PIN reset code is ${code}. It expires in 10 minutes.\n\nYou will also need your recovery phrase. HASHPASS never asks for it by email or chat. If you did not request this, ignore this message.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2>Reset your wallet PIN</h2><p>Enter this code in HASHPASS:</p><div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:20px 0"><h1 style="font-size:32px;letter-spacing:8px;margin:0">${code}</h1></div><p style="color:#6b7280;font-size:14px">It expires in 10 minutes. You will also need your recovery phrase; HASHPASS never asks for it by email or chat.</p><p style="color:#6b7280;font-size:14px">If you did not request this, ignore this message.</p></div>`,
  });
}
