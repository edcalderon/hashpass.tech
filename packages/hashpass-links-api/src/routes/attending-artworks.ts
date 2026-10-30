import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { adminDb, apiError } from '../server';
import { validateCaptchaToken } from './captcha';
import type {
  AttendingArtworkEmailStatus,
  AttendingArtworkShareRow,
  ArtworkEmailCopy,
  CreateAttendingArtworkBody,
  MailerConfig,
} from './attending-artworks.types';

const BUCKET = 'attending-artworks';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;
const EVENT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PUBLIC_ARTWORK_URL_PATTERN = /^https:\/\/(?:[a-z0-9][a-z0-9-]{0,62}\.hashpass\.tech(?:\/attending\/[a-z0-9][a-z0-9-]{0,79})?|hashpass\.club\/attendings)\/?$/;

function mailerEnvironmentValue(name: string, suffix: '' | '_UPDATES' = '', env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[`NODEMAILER_${name}${suffix}`];
}

function readMailerConfig(suffix: '' | '_UPDATES', env: NodeJS.ProcessEnv = process.env): MailerConfig {
  return {
    host: mailerEnvironmentValue('HOST', suffix, env) || '',
    port: mailerEnvironmentValue('PORT', suffix, env) || '587',
    user: mailerEnvironmentValue('USER', suffix, env) || '',
    pass: mailerEnvironmentValue('PASS', suffix, env) || '',
    from: mailerEnvironmentValue('FROM', suffix, env) || '',
    suffix,
  };
}

/**
 * Artwork mail is transactional and normally uses the Brevo-backed primary
 * sender. Some deployments only provision the updates mailbox, however, so
 * use that complete configuration as a safe fallback instead of silently
 * dropping the confirmation email.
 */
export function resolveArtworkMailerConfig(env: NodeJS.ProcessEnv = process.env): MailerConfig | null {
  const primary = readMailerConfig('', env);
  if (primary.host && primary.user && primary.pass && primary.from) return primary;

  const updates = readMailerConfig('_UPDATES', env);
  if (updates.host && updates.user && updates.pass && updates.from) return updates;
  return null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function absoluteUrl(request: Request, path: string): string {
  const publicOrigin = process.env.PUBLIC_ARTWORK_SHARE_ORIGIN || new URL(request.url).origin;
  return new URL(path, publicOrigin).toString();
}

function eventArtworkShareUrl(request: Request, eventSlug: string, eventUrl: string, token: string): string {
  if (eventSlug === 'community') return absoluteUrl(request, `/a/${token}`);
  const origin = new URL(eventUrl).origin;
  return new URL(`/attending/${eventSlug}/a/${token}`, origin).toString();
}

function eventArtworkImageUrl(request: Request, token: string): string {
  // Keep the image on the first-party short-link origin for every event. The
  // tenant event URL is the right destination for event details, but it may
  // redirect image requests through a separate host (and its CSP cannot
  // safely allow every tenant/storage origin). Serving the image from the
  // same origin also gives social crawlers and email clients one stable URL.
  return absoluteUrl(request, `/a/${token}/image`);
}

function readArtworkBytes(value: unknown): Buffer | null {
  if (typeof value !== 'string') return null;
  const encoded = value.replace(/^data:image\/png;base64,/i, '');
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return null;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
  return bytes;
}

function validLocale(value: unknown): string {
  if (typeof value !== 'string') return 'en';
  return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value) ? value : 'en';
}

export function getArtworkEmailCopy(locale: string, attendeeName: string, eventName: string): ArtworkEmailCopy {
  if (locale.toLowerCase().startsWith('es')) {
    return {
      subject: `Tu arte del evento está listo · ${eventName}`,
      heading: `Tu arte está listo, ${attendeeName}`,
      description: `Tu imagen personal para compartir del evento ${eventName} está lista.`,
      openLabel: 'Abrir mi arte',
      downloadLabel: 'Descargar PNG',
      attachmentNotice: 'También adjuntamos una copia PNG. El enlace público vence en 90 días y cualquiera que lo tenga puede verlo.',
      textGreeting: `Hola ${attendeeName},`,
    };
  }

  return {
    subject: `Your event artwork is ready · ${eventName}`,
    heading: `Your artwork is ready, ${attendeeName}`,
    description: `Your shareable attendance artwork for ${eventName} is ready.`,
    openLabel: 'Open your artwork',
    downloadLabel: 'Download PNG',
    attachmentNotice: 'A PNG copy is attached to this email. The public link expires in 90 days and is visible to anyone who has it.',
    textGreeting: `Hi ${attendeeName},`,
  };
}

export function buildArtworkEmailMessage(input: {
  attendeeName: string;
  eventName: string;
  shareUrl: string;
  imageUrl: string;
  image: Buffer;
  locale: string;
}): {
  subject: string;
  text: string;
  html: string;
  attachments: Array<{ filename: string; content: Buffer; contentType: string; contentDisposition: 'inline'; cid: string }>;
} {
  const copy = getArtworkEmailCopy(input.locale, input.attendeeName, input.eventName);
  const shareUrl = escapeHtml(input.shareUrl);
  const imageUrl = escapeHtml(input.imageUrl);
  const heading = escapeHtml(copy.heading);
  const description = escapeHtml(copy.description);
  const openLabel = escapeHtml(copy.openLabel);
  const downloadLabel = escapeHtml(copy.downloadLabel);
  const attachmentNotice = escapeHtml(copy.attachmentNotice);
  const cid = 'hashpass-event-artwork';

  return {
    subject: copy.subject,
    text: `${copy.textGreeting}\n\n${copy.description}\n\n${copy.openLabel}: ${input.shareUrl}\n${copy.downloadLabel}: ${input.imageUrl}\n\n${copy.attachmentNotice}`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#101b2c"><main style="max-width:560px;margin:32px auto;padding:28px;background:#fff;border:1px solid #dbe4ef;border-radius:20px"><p style="font-size:12px;letter-spacing:.12em;font-weight:700;color:#1976d2">HASHPASS · EVENT ARTWORK</p><h1 style="font-size:24px">${heading}</h1><p>${description}</p><p><a href="${shareUrl}" style="display:inline-block;padding:13px 20px;background:#1976d2;color:#fff;border-radius:999px;text-decoration:none;font-weight:700">${openLabel}</a> <a href="${imageUrl}" style="display:inline-block;padding:13px 20px;background:#e8eef7;color:#173454;border-radius:999px;text-decoration:none;font-weight:700">${downloadLabel}</a></p><p><img src="cid:${cid}" alt="Your event artwork" style="display:block;width:100%;height:auto;border-radius:14px"></p><p style="font-size:13px;color:#64748b">${attachmentNotice}</p></main></body></html>`,
    attachments: [{
      filename: 'hashpass-event-artwork.png',
      content: input.image,
      contentType: 'image/png',
      contentDisposition: 'inline',
      cid,
    }],
  };
}

async function sendArtworkEmail(input: {
  email: string;
  attendeeName: string;
  eventName: string;
  shareUrl: string;
  imageUrl: string;
  image: Buffer;
  locale: string;
}): Promise<boolean> {
  const config = resolveArtworkMailerConfig();
  if (!config) {
    console.warn('[hashpass-links-api] Artwork email skipped: no complete transactional or updates SMTP configuration.');
    return false;
  }

  const host = config.host;
  const port = Number.parseInt(config.port, 10);
  const secure = port === 465;
  const normalizedHost = host.trim().toLowerCase().replace(/\.$/, '').split(':')[0];
  const isBrevo = normalizedHost === 'brevo.com'
    || normalizedHost.endsWith('.brevo.com')
    || normalizedHost === 'sendinblue.com'
    || normalizedHost.endsWith('.sendinblue.com');
  const message = buildArtworkEmailMessage(input);
  let closeTransporter: (() => void) | undefined;
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10_000,
      tls: isBrevo
        ? { rejectUnauthorized: process.env.NODE_ENV === 'production', checkServerIdentity: () => undefined }
        : { rejectUnauthorized: process.env.NODE_ENV === 'production' },
      requireTLS: !secure,
    });
    closeTransporter = () => transporter.close();
    const delivery = await transporter.sendMail({
      from: `HASHPASS <${config.from}>`,
      to: input.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
    });
    return delivery.accepted.length > 0;
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : 'unknown';
    console.error(`[hashpass-links-api] Artwork email delivery failed (${code}).`);
    return false;
  } finally {
    closeTransporter?.();
  }
}

async function findShare(token: string): Promise<AttendingArtworkShareRow | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const { data, error } = await adminDb()
    .from('attending_artwork_shares')
    .select('id,token_hash,object_path,event_slug,event_name,attendee_name,caption,event_url,locale,created_at,expires_at')
    .eq('token_hash', hashToken(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return data as AttendingArtworkShareRow;
}

// POST /api/v1/attending-artworks -- publish one user-created PNG after Cap verification.
export async function createAttendingArtwork(request: Request): Promise<Response> {
  const contentLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_IMAGE_BYTES * 1.4 + 16_384) return apiError('Artwork is larger than 4 MB', 413);

  const body = await request.json().catch(() => ({})) as CreateAttendingArtworkBody;
  const captchaValid = await validateCaptchaToken(body.captchaToken);
  if (!captchaValid) {
    return Response.json({ message: 'Security check expired. Please solve the captcha again.', captchaExpired: true }, { status: 400 });
  }

  const image = readArtworkBytes(body.imageBase64);
  if (!image) return apiError('A PNG artwork smaller than 4 MB is required');
  if (typeof body.eventSlug !== 'string' || !EVENT_SLUG_PATTERN.test(body.eventSlug)) return apiError('Invalid event');
  if (typeof body.eventName !== 'string' || !body.eventName.trim() || body.eventName.length > 180) return apiError('Invalid event name');
  if (typeof body.attendeeName !== 'string' || Array.from(body.attendeeName.trim()).length < 2 || Array.from(body.attendeeName.trim()).length > 100) {
    return apiError('Enter a valid name before publishing the artwork');
  }
  if (typeof body.caption !== 'string' || !body.caption.trim() || body.caption.length > 500) return apiError('Invalid share caption');
  if (typeof body.eventUrl !== 'string' || !PUBLIC_ARTWORK_URL_PATTERN.test(body.eventUrl)) return apiError('Invalid event page URL');
  const eventUrl = new URL(body.eventUrl);
  const eventPath = eventUrl.pathname.replace(/\/$/, '');
  const isCommunityEvent = body.eventSlug === 'community'
    && eventUrl.hostname === 'hashpass.club'
    && eventPath === '/attendings';
  const expectedPath = body.eventSlug === 'bsl' ? `/attending/${body.eventSlug}` : '';
  const expectedHost = `${body.eventSlug}.hashpass.tech`;
  const isConfiguredEvent = eventUrl.hostname === expectedHost && eventPath === expectedPath;
  if (!isCommunityEvent && !isConfiguredEvent) {
    return apiError('Event URL must match the selected event');
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) return apiError('Enter a valid email address or leave it blank');

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const objectPath = `${tokenHash}.png`;
  const db = adminDb();
  const { error: uploadError } = await db.storage.from(BUCKET).upload(objectPath, image, {
    contentType: 'image/png',
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) return apiError('Could not publish the artwork. Please try again.', 500);

  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const row = {
    token_hash: tokenHash,
    object_path: objectPath,
    event_slug: body.eventSlug,
    event_name: body.eventName.trim(),
    attendee_name: body.attendeeName.trim().replace(/\s+/gu, ' '),
    caption: body.caption.trim(),
    event_url: body.eventUrl,
    locale: validLocale(body.locale),
    expires_at: expiresAt,
  };
  const { error: insertError } = await db.from('attending_artwork_shares').insert(row);
  if (insertError) {
    await db.storage.from(BUCKET).remove([objectPath]);
    return apiError('Could not publish the artwork. Please try again.', 500);
  }

  const shareUrl = eventArtworkShareUrl(request, row.event_slug, row.event_url, token);
  const imageUrl = eventArtworkImageUrl(request, token);
  let emailStatus: AttendingArtworkEmailStatus = 'not_requested';
  if (email) {
    emailStatus = await sendArtworkEmail({
      email,
      attendeeName: row.attendee_name,
      eventName: row.event_name,
      shareUrl,
      imageUrl,
      image,
      locale: row.locale,
    }) ? 'sent' : 'unavailable';
  }

  return Response.json({ shareUrl, imageUrl, expiresAt, emailStatus }, { status: 201 });
}

// GET /a/:token -- a small, crawlable Open Graph page for social previews.
export async function getAttendingArtworkShare(request: Request, token: string): Promise<Response> {
  const share = await findShare(token);
  if (!share) return apiError('Artwork link not found or expired', 404);

  const shareUrl = eventArtworkShareUrl(request, share.event_slug, share.event_url, token);
  const imageUrl = eventArtworkImageUrl(request, token);
  const customEventArtwork = share.event_slug === 'community';
  const title = `${share.attendee_name} · ${share.event_name} | HASHPASS`;
  const description = `${share.attendee_name} made a shareable attendance artwork for ${share.event_name}. This is a personal intention, not an RSVP or ticket.`;
  const disclaimer = 'A personal intention, not an RSVP, ticket, or proof of attendance. This artwork link expires in 90 days.';
  const sourceLinkLabel = customEventArtwork ? 'Create artwork for your event' : 'Event details';
  const html = `<!doctype html>
<html lang="${escapeHtml(share.locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(shareUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="HASHPASS">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:url" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:alt" content="${escapeHtml(share.attendee_name)}’s artwork for ${escapeHtml(share.event_name)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1080">
  <meta property="og:image:height" content="1350">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <meta name="twitter:image:alt" content="${escapeHtml(share.attendee_name)}’s artwork for ${escapeHtml(share.event_name)}">
  <style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#071a29;color:#f5f8fb;font:16px/1.5 system-ui,sans-serif}.card{width:min(100%,560px);padding:20px;border:1px solid #294657;border-radius:24px;background:#0d2232;box-sizing:border-box}.card img{display:block;width:min(100%,432px);height:auto;margin:0 auto 20px;border-radius:16px}.card h1{font-size:24px;line-height:1.2}.card p{color:#b8c9d4}.actions{display:flex;gap:12px;flex-wrap:wrap}.actions a{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border-radius:999px;background:#18c49a;color:#06231d;text-decoration:none;font-weight:700}.actions a.secondary{background:#173a4b;color:#d7f5ee}</style>
</head>
<body>
  <main class="card">
    <img src="${escapeHtml(imageUrl)}" width="1080" height="1350" alt="${escapeHtml(share.attendee_name)}’s artwork for ${escapeHtml(share.event_name)}">
    <h1>${escapeHtml(share.attendee_name)} · ${escapeHtml(share.event_name)}</h1>
    <p>${escapeHtml(share.caption)}</p>
    <p>${escapeHtml(disclaimer)}</p>
    <div class="actions"><a href="${escapeHtml(imageUrl)}">View image</a><a class="secondary" href="${escapeHtml(share.event_url)}">${sourceLinkLabel}</a></div>
  </main>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

// GET /a/:token/image -- serve the PNG through the first-party short-link
// origin. Keeping the storage provider behind this endpoint makes the URL
// stable for social crawlers and prevents previews from being tied to a
// Supabase hostname.
export async function redirectAttendingArtworkImage(request: Request, token: string): Promise<Response> {
  const share = await findShare(token);
  if (!share) return apiError('Artwork link not found or expired', 404);

  const { data, error } = await adminDb().storage.from(BUCKET).download(share.object_path);
  if (error || !data) return apiError('Artwork image not found or expired', 404);

  return new Response(data, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'content-length': String(data.size),
      'content-disposition': 'inline; filename="hashpass-event-artwork.png"',
      'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

// Called by the existing EventBridge expiry sweep, which already runs every
// few minutes for QR links. Keep uploaded artwork in step with its 90-day URL.
export async function deleteExpiredAttendingArtworks(): Promise<number> {
  const db = adminDb();
  const { data, error } = await db
    .from('attending_artwork_shares')
    .select('id,object_path')
    .lt('expires_at', new Date().toISOString())
    .limit(200);
  if (error || !data?.length) return 0;

  const expired = data as Array<{ id: string; object_path: string }>;
  const { error: storageError } = await db.storage.from(BUCKET).remove(expired.map((share) => share.object_path));
  if (storageError) return 0;
  const { error: deleteError } = await db.from('attending_artwork_shares').delete().in('id', expired.map((share) => share.id));
  return deleteError ? 0 : expired.length;
}
