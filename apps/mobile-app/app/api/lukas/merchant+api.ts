import cap from '@/lib/cap-instance';
import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { sendLukasMerchantInquiry } from '@/lib/email';

const BOOKING_URL = 'https://calendar.app.google/vYsTa9GpamSVccAt9';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://lukas.hashpass.tech',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: object, status = 200) => Response.json(body, { status, headers: corsHeaders });
const clean = (value: unknown, max: number) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`lukas-merchant:ip:${ip}`)) return json({ error: 'Too many requests' }, 429);
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Content-Type must be application/json' }, 400);
  }

  const body = await request.json().catch(() => ({}));
  const contactName = clean(body?.contactName, 120);
  const email = clean(body?.email, 254).toLowerCase();
  const merchantType = clean(body?.merchantType, 100);
  const description = clean(body?.description, 5_000);
  const bookingPreference = clean(body?.bookingPreference, 80);
  const captchaToken = clean(body?.captchaToken, 2_048);

  if (!contactName || !merchantType || !description || !EMAIL_PATTERN.test(email) || !captchaToken) {
    return json({ error: 'Please complete all merchant fields and the security check.' }, 400);
  }
  if (!rateLimitOk(`lukas-merchant:email:${email}`)) return json({ error: 'Too many requests' }, 429);

  let captchaValid = false;
  try {
    captchaValid = (await cap.validateToken(captchaToken)).success;
  } catch (captchaError) {
    console.error('[lukas/merchant] captcha validation failed:', captchaError);
  }
  if (!captchaValid) return json({ error: 'Security check expired. Please try again.', captchaExpired: true }, 400);

  const delivery = await sendLukasMerchantInquiry({ contactName, email, merchantType, description, bookingPreference });
  if (!delivery.success) {
    console.error('[lukas/merchant] email delivery failed:', delivery.error);
    return json({ error: 'Unable to send the merchant request right now.' }, 502);
  }
  return json({ success: true, bookingUrl: BOOKING_URL }, 201);
}
