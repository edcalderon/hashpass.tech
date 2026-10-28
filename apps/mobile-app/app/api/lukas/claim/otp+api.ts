import cap from '@/lib/cap-instance';
import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { POST as sendAuthOtp } from '../../auth/otp+api';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://lukas.hashpass.tech',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken.trim() : '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !captchaToken || captchaToken.length > 2_048) {
    return Response.json({ error: 'A valid email and security check are required.' }, { status: 400, headers: corsHeaders });
  }
  if (!rateLimitOk(`lukas-claim-otp:ip:${ip}`) || !rateLimitOk(`lukas-claim-otp:email:${email}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: corsHeaders });
  }
  let captchaValid = false;
  try {
    captchaValid = (await cap.validateToken(captchaToken)).success;
  } catch {
    captchaValid = false;
  }
  if (!captchaValid) return Response.json({ error: 'Security check expired. Please try again.', captchaExpired: true }, { status: 400, headers: corsHeaders });

  return sendAuthOtp(new Request(new URL('/api/auth/otp', request.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  }));
}
