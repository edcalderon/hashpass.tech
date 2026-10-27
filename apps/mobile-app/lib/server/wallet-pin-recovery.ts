import { createTransactionalTransport } from './smtp-transport';
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
  const { transport, from } = createTransactionalTransport(env);
  await transport.sendMail({
    from, to,
    subject: 'Your HASHPASS wallet PIN reset code',
    text: `Your wallet PIN reset code is ${code}. It expires in 10 minutes.\n\nYou will also need your recovery phrase. HASHPASS never asks for it by email or chat. If you did not request this, ignore this message.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h2>Reset your wallet PIN</h2><p>Enter this code in HASHPASS:</p><div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:20px 0"><h1 style="font-size:32px;letter-spacing:8px;margin:0">${code}</h1></div><p style="color:#6b7280;font-size:14px">It expires in 10 minutes. You will also need your recovery phrase; HASHPASS never asks for it by email or chat.</p><p style="color:#6b7280;font-size:14px">If you did not request this, ignore this message.</p></div>`,
  });
}
