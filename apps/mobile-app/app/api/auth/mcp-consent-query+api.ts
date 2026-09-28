import { getAuth } from '@/lib/server/better-auth';
import { verifySignedOAuthQuery } from '@/lib/server/verify-signed-oauth-query';

const allowedOrigins = new Set([
  'https://hashpass.tech',
  'https://www.hashpass.tech',
  'http://localhost:8081',
]);

const corsHeaders = (request: Request) => {
  const origin = request.headers.get('origin') || '';
  return {
    ...(allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
};

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const auth = getAuth();
  if (!auth) {
    return Response.json({ error: 'Authentication service unavailable' }, { status: 503, headers: corsHeaders(request) });
  }

  const signedQuery = new URL(request.url).search.slice(1);
  const { secret } = await auth.$context;
  if (!signedQuery || !(await verifySignedOAuthQuery(signedQuery, secret))) {
    return Response.json({ error: 'Invalid or expired authorization request' }, { status: 400, headers: corsHeaders(request) });
  }

  const params = new URLSearchParams(signedQuery);
  const scopes = (params.get('scope') || '').split(/\s+/).filter(Boolean);
  return Response.json(
    {
      clientId: params.get('client_id') || '',
      scopes,
    },
    { headers: corsHeaders(request) },
  );
}
