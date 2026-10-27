import nodemailer from 'nodemailer';

/**
 * Builds the transactional SMTP transport from NODEMAILER_* settings. Kept free of the heavy
 * lib/email.ts imports so small auth-code senders can share the relay without loading them.
 * Throws `email_unavailable` when the relay is not configured.
 */
export function createTransactionalTransport(env: NodeJS.ProcessEnv = process.env) {
  if (!env.NODEMAILER_FROM || !env.NODEMAILER_PASS) throw new Error('email_unavailable');
  const host = env.NODEMAILER_HOST || 'smtp.sendgrid.net';
  const name = host.trim().toLowerCase().replace(/\.$/, '').split(':')[0];
  const brevo = name === 'brevo.com' || name.endsWith('.brevo.com') || name === 'sendinblue.com' || name.endsWith('.sendinblue.com');
  return {
    from: `HASHPASS <${env.NODEMAILER_FROM}>`,
    transport: nodemailer.createTransport({
      host, port: parseInt(env.NODEMAILER_PORT || '587'), secure: false, requireTLS: true,
      auth: { user: env.NODEMAILER_USER || 'apikey', pass: env.NODEMAILER_PASS },
      // Brevo edges serve different relay certs (legacy sendinblue.com names
      // or brevo.com names), so no single hostname validates everywhere; keep
      // the CA chain check, skip the hostname match.
      tls: { rejectUnauthorized: env.NODE_ENV === 'production', ...(brevo ? { checkServerIdentity: () => undefined } : {}) },
    }),
  };
}
