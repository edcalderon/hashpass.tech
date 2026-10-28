import { getAuth } from '@/lib/server/better-auth';
import { verifySignedOAuthQuery } from '@/lib/server/verify-signed-oauth-query';
import {
  createCorsPreflightResponse,
  getCorsHeaders,
  MCP_CONSENT_CORS_ALLOWED_ORIGINS,
} from '@/lib/cors';

const corsOptions = {
  allowedOrigins: MCP_CONSENT_CORS_ALLOWED_ORIGINS,
  allowCredentials: true,
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
} as const;

const corsHeaders = (request: Request) => {
  return {
    ...getCorsHeaders(request, corsOptions),
    'Cache-Control': 'no-store',
  };
};

export function OPTIONS(request: Request) {
  return createCorsPreflightResponse(request, corsOptions);
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
  const clientId = params.get('client_id') || '';
  const redirectUri = params.get('redirect_uri') || '';
  if (!clientId || !redirectUri) {
    return Response.json({ error: 'Authorization request is missing client details' }, { status: 400, headers: corsHeaders(request) });
  }

  let client: { client_name?: string; client_uri?: string };
  try {
    client = await auth.api.getOAuthClientPublic({
      headers: request.headers,
      query: { client_id: clientId },
    });
  } catch {
    return Response.json({ error: 'OAuth client is unknown or disabled' }, { status: 400, headers: corsHeaders(request) });
  }

  const scopes = (params.get('scope') || '').split(/\s+/).filter(Boolean);
  return Response.json(
    {
      clientId,
      clientName: client.client_name || '',
      clientUri: client.client_uri || '',
      redirectUri,
      scopes,
    },
    { headers: corsHeaders(request) },
  );
}
