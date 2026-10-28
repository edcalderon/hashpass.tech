import cap from '@/lib/cap-instance';
import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { POST as sendAuthOtp } from '../../auth/otp+api';
import {
  createCorsPreflightResponse,
  getCorsHeaders,
  LUKAS_CORS_ALLOWED_ORIGINS,
  withCors,
} from '@/lib/cors';

const corsOptions = {
  allowedOrigins: LUKAS_CORS_ALLOWED_ORIGINS,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
} as const;

const corsHeaders = (request?: Request) => getCorsHeaders(request, corsOptions);

export function OPTIONS(request?: Request) {
  return createCorsPreflightResponse(request, corsOptions);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken.trim() : '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !captchaToken || captchaToken.length > 2_048) {
    return Response.json({ error: 'A valid email and security check are required.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (!rateLimitOk(`lukas-claim-otp:ip:${ip}`) || !rateLimitOk(`lukas-claim-otp:email:${email}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: corsHeaders(request) });
  }
  let captchaValid = false;
  try {
    captchaValid = (await cap.validateToken(captchaToken)).success;
  } catch {
    captchaValid = false;
  }
  if (!captchaValid) return Response.json({ error: 'Security check expired. Please try again.', captchaExpired: true }, { status: 400, headers: corsHeaders(request) });

  const response = await sendAuthOtp(new Request(new URL('/api/auth/otp', request.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  }));
  return withCors(response, request, corsOptions);
}
