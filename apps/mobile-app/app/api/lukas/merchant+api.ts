import cap from '@/lib/cap-instance';
import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { sendLukasMerchantInquiry } from '@/lib/email';
import {
  createCorsPreflightResponse,
  LUKAS_CORS_ALLOWED_ORIGINS,
  withCors,
} from '@/lib/cors';

const BOOKING_URL = 'https://calendar.app.google/vYsTa9GpamSVccAt9';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const corsOptions = {
  allowedOrigins: LUKAS_CORS_ALLOWED_ORIGINS,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
} as const;

const json = (request: Request, body: object, status = 200) => withCors(Response.json(body, { status }), request, corsOptions);
const clean = (value: unknown, max: number) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';

export function OPTIONS(request?: Request) {
  return createCorsPreflightResponse(request, corsOptions);
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`lukas-merchant:ip:${ip}`)) return json(request, { error: 'Too many requests' }, 429);
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json(request, { error: 'Content-Type must be application/json' }, 400);
  }

  const body = await request.json().catch(() => ({}));
  const contactName = clean(body?.contactName, 120);
  const email = clean(body?.email, 254).toLowerCase();
  const merchantType = clean(body?.merchantType, 100);
  const description = clean(body?.description, 5_000);
  const bookingPreference = clean(body?.bookingPreference, 80);
  const captchaToken = clean(body?.captchaToken, 2_048);

  if (!contactName || !merchantType || !description || !EMAIL_PATTERN.test(email) || !captchaToken) {
    return json(request, { error: 'Please complete all merchant fields and the security check.' }, 400);
  }
  if (!rateLimitOk(`lukas-merchant:email:${email}`)) return json(request, { error: 'Too many requests' }, 429);

  let captchaValid = false;
  try {
    captchaValid = (await cap.validateToken(captchaToken)).success;
  } catch (captchaError) {
    console.error('[lukas/merchant] captcha validation failed:', captchaError);
  }
  if (!captchaValid) return json(request, { error: 'Security check expired. Please try again.', captchaExpired: true }, 400);

  const delivery = await sendLukasMerchantInquiry({ contactName, email, merchantType, description, bookingPreference });
  if (!delivery.success) {
    console.error('[lukas/merchant] email delivery failed:', delivery.error);
    return json(request, { error: 'Unable to send the merchant request right now.' }, 502);
  }
  return json(request, { success: true, bookingUrl: BOOKING_URL }, 201);
}
