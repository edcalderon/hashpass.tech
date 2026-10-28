import { getBetterAuthSessionUser } from '@/lib/server/better-auth-session-client';
import {
  createCorsPreflightResponse,
  LUKAS_CORS_ALLOWED_ORIGINS,
  withCors,
} from '@/lib/cors';

const corsOptions = {
  allowedOrigins: LUKAS_CORS_ALLOWED_ORIGINS,
  allowCredentials: true,
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
} as const;

const json = (request: Request, body: object, status = 200) =>
  withCors(Response.json(body, { status }), request, corsOptions);

export function OPTIONS(request?: Request) {
  return createCorsPreflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  try {
    const user = await getBetterAuthSessionUser(request);
    if (!user) return json(request, { error: 'No active HashPass session found' }, 401);
    return json(request, {
      success: true,
      user: { id: user.id, email: user.email, name: [user.first_name, user.last_name].filter(Boolean).join(' ') },
    });
  } catch (error) {
    console.error('[lukas/session] unhandled error:', error);
    return json(request, { error: 'Unable to verify the HashPass session' }, 500);
  }
}
