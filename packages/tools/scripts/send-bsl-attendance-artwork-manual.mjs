#!/usr/bin/env node
/**
 * Manual BSL 2026 attendance-artwork dispatch.
 *
 * This is intentionally a direct, one-off Nodemailer/Brevo sender for the
 * approved global announcement. It follows the established legacy campaign
 * pattern while keeping the recipient query explicitly production-scoped.
 *
 * Usage:
 *   node packages/tools/scripts/send-bsl-attendance-artwork-manual.mjs
 *   node packages/tools/scripts/send-bsl-attendance-artwork-manual.mjs --send
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
for (const file of ['.env.local', '.env', 'apps/mobile-app/.env.local', 'apps/mobile-app/.env']) {
  const candidate = path.join(root, file);
  if (fs.existsSync(candidate)) dotenv.config({ path: candidate, override: false, quiet: true });
}

const productionRef = 'fxgftanraszjjyeidvia';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const smtpHost = process.env.NODEMAILER_HOST || '';
const smtpPort = Number.parseInt(process.env.NODEMAILER_PORT || '587', 10);
const smtpUser = process.env.NODEMAILER_USER || '';
const smtpPass = process.env.NODEMAILER_PASS || '';
const smtpFrom = process.env.NODEMAILER_FROM || '';
const shouldSend = process.argv.includes('--send');
const complementaryLanguage = process.argv.includes('--complementary');

function required(value, label) {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

function providerHost(host) {
  return /(^|\.)brevo\.com$|(^|\.)sendinblue\.com$/i.test(host.split(':')[0]);
}

function loadAsset(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing email asset: ${relativePath}`);
  return fs.readFileSync(absolutePath);
}

function loadTemplate(locale) {
  const template = fs.readFileSync(
    path.join(root, `apps/mobile-app/config/marketing/emails/bsl2026-attendance-invitation.${locale}.html`),
    'utf8',
  );
  const text = fs.readFileSync(
    path.join(root, `apps/mobile-app/config/marketing/emails/bsl2026-attendance-invitation.${locale}.txt`),
    'utf8',
  );
  const content = locale === 'en'
    ? {
        subject: 'Are you coming to BSL Bogotá?',
        previewFooter: 'Internal preview of a HASHPASS campaign. The final send includes recipient-specific subscription controls.',
        previewOptout: 'A personal unsubscribe link will be added when the campaign is sent.',
        sentFooter: 'This email was sent by HASHPASS as an update about BSL Colombia 2026.',
        sentOptout: 'To stop receiving campaign emails, contact updates@hashpass.tech.',
        imageUrl: 'https://hashpass.tech/attending/email-previews/bsl-colombia-2026-attendance-en.jpg',
      }
    : {
        subject: '¿Vas a asistir a BSL Bogotá?',
        previewFooter: 'Vista previa interna de una campaña HASHPASS. El envío final incluye controles de suscripción personalizados.',
        previewOptout: 'El enlace personal para cancelar la suscripción se añadirá al enviar la campaña.',
        sentFooter: 'Este correo fue enviado por HASHPASS como actualización sobre BSL Colombia 2026.',
        sentOptout: 'Para dejar de recibir campañas, escribe a updates@hashpass.tech.',
        imageUrl: 'https://hashpass.tech/attending/email-previews/bsl-colombia-2026-attendance-es.jpg',
      };
  return {
    subject: content.subject,
    html: template
      .replaceAll('https://hashpass.tech/attending/email-previews/hashpass-white-cyan.png', 'cid:hashpass-wordmark')
      .replaceAll('https://hashpass.tech/attending/email-previews/bsl-ontour-pro.png', 'cid:bsl-ontour-wordmark')
      .replaceAll(content.imageUrl, `cid:bsl-attendance-${locale}`)
      .replace(content.previewFooter, content.sentFooter)
      .replace(content.previewOptout, content.sentOptout),
    text: text.replace(content.previewFooter, content.sentFooter).replace(content.previewOptout, content.sentOptout),
    attachments: [
      { filename: 'hashpass-white-cyan.png', content: loadAsset('apps/web-app/public/attending/email-previews/hashpass-white-cyan.png'), contentType: 'image/png', cid: 'hashpass-wordmark' },
      { filename: 'bsl-on-tour.png', content: loadAsset('apps/web-app/public/attending/email-previews/bsl-ontour-pro.png'), contentType: 'image/png', cid: 'bsl-ontour-wordmark' },
      { filename: `bsl-colombia-2026-attendance-${locale}.jpg`, content: loadAsset(`apps/web-app/public/attending/email-previews/bsl-colombia-2026-attendance-${locale}.jpg`), contentType: 'image/jpeg', cid: `bsl-attendance-${locale}` },
    ],
  };
}

async function listRecipients(client) {
  const recipients = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('user')
      .select('id,email,status,deleted_at,profile_metadata')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('email', 'is', null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Unable to load production users: ${error.message}`);
    const current = (data || [])
      .map(user => ({
        id: user.id,
        email: String(user.email || '').trim().toLowerCase(),
        locale: user.profile_metadata?.locale === 'en' ? 'en' : 'es',
      }))
      .filter(user => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email));
    recipients.push(...current);
    if ((data || []).length < pageSize) break;
  }
  return [...new Map(recipients.map(recipient => [recipient.email, recipient])).values()];
}

async function main() {
  required(supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL');
  required(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY');
  required(smtpHost, 'NODEMAILER_HOST');
  required(smtpUser, 'NODEMAILER_USER');
  required(smtpPass, 'NODEMAILER_PASS');
  required(smtpFrom, 'NODEMAILER_FROM');
  const hostname = new URL(supabaseUrl).hostname;
  if (!hostname.includes(productionRef)) throw new Error('Refusing to dispatch: the configured Supabase project is not core production.');

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const recipients = await listRecipients(supabase);
  const counts = recipients.reduce((result, recipient) => {
    result[recipient.locale] += 1;
    return result;
  }, { es: 0, en: 0 });
  console.log(JSON.stringify({ environment: 'core-production', campaign: 'bsl2026-attendance-invitation', recipients: recipients.length, locales: counts, messageSet: complementaryLanguage ? 'complementary-language' : 'profile-locale', mode: shouldSend ? 'send' : 'dry-run' }));
  if (!shouldSend) return;
  if (recipients.length === 0) throw new Error('No active production recipients found.');

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    requireTLS: smtpPort !== 465,
    tls: providerHost(smtpHost)
      ? { rejectUnauthorized: process.env.NODE_ENV === 'production', servername: 'smtp-relay.sendinblue.com', checkServerIdentity: () => undefined }
      : { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  });
  await transporter.verify();
  const templates = { es: loadTemplate('es'), en: loadTemplate('en') };
  let accepted = 0;
  let failed = 0;
  let unknown = 0;
  for (const recipient of recipients) {
    const locale = complementaryLanguage ? (recipient.locale === 'en' ? 'es' : 'en') : recipient.locale;
    const template = templates[locale];
    try {
      const delivery = await transporter.sendMail({
        from: `HASHPASS <${smtpFrom}>`,
        to: recipient.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        attachments: template.attachments.map(attachment => ({ ...attachment, contentDisposition: 'inline' })),
        headers: { 'X-HASHPASS-Campaign': 'bsl2026-attendance-invitation' },
      });
      if (delivery.rejected?.length) failed += 1;
      else if (delivery.accepted?.some(address => String(address).toLowerCase() === recipient.email)) accepted += 1;
      else unknown += 1;
    } catch {
      unknown += 1;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.log(JSON.stringify({ campaign: 'bsl2026-attendance-invitation', total: recipients.length, accepted, failed, unknown }));
  if (failed || unknown) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
