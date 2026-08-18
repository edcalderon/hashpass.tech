// AWS Lambda handler for the HashPass Links API (hashpass.link).
//
// Event <-> Web Request/Response conversion mirrors
// packages/infra/lambda/index.js (the existing Expo Router API Lambda) --
// that logic is framework-agnostic, so it's ported here rather than
// reinvented, just wired to this service's own handleRequest() instead of
// Expo's createRequestHandler().
import { handleRequest } from '../src/router';
import { archiveExpiredQrLinks } from '../src/routes/qr-links';

interface ApiGatewayEvent {
  httpMethod?: string;
  path?: string;
  rawQueryString?: string;
  queryStringParameters?: Record<string, string> | null;
  headers?: Record<string, string>;
  cookies?: string[];
  body?: string | null;
  version?: string;
  requestContext?: {
    http?: { method?: string; path?: string };
    httpMethod?: string;
    path?: string;
    domainName?: string;
  };
}

interface ApiGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
  cookies?: string[];
  multiValueHeaders?: Record<string, string[]>;
}

interface ScheduledEvent {
  source?: string;
  'detail-type'?: string;
}

const DEFAULT_CORS_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://hashpass.club',
  // The Club opens this approval screen on the HashPass app domain. The
  // browser then calls this API directly from hashpass.tech, so that origin
  // must be allowed on both the Lambda response and API Gateway's preflight
  // configuration (in packages/infra/terraform/stacks/hashpass-links-api).
  'https://hashpass.tech',
  'https://www.hashpass.tech',
  'https://hashpass.link',
  // A club-dev tenant's resolveHashpassAppUrl() opens the approval screen
  // at dev.hashpass.tech instead -- without this, the dev web sign-in flow
  // fails preflight the same way prod would without the entries above.
  'https://dev.hashpass.tech',
];

function splitCsv(value: string | undefined): string[] {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

function resolveCorsOrigin(event: ApiGatewayEvent): string {
  const origin = getHeader(event.headers, 'origin');
  if (!origin) return '*';

  const allowedOrigins = new Set([...DEFAULT_CORS_ALLOWED_ORIGINS, ...splitCsv(process.env.CORS_ALLOW_ORIGINS)]);
  return allowedOrigins.has('*') || allowedOrigins.has(origin) ? origin : '*';
}

function applyCorsHeaders(headers: Record<string, string>, event: ApiGatewayEvent): Record<string, string> {
  const resolvedOrigin = resolveCorsOrigin(event);

  if (!headers['access-control-allow-origin']) headers['access-control-allow-origin'] = resolvedOrigin;
  if (!headers['access-control-allow-methods']) {
    headers['access-control-allow-methods'] = 'GET, POST, PATCH, OPTIONS';
  }
  if (!headers['access-control-allow-headers']) {
    // x-hashpass-app-id (every request), x-hashpass-binding (poll/exchange),
    // and idempotency-key (respondToLogin's approve/deny POST) are custom
    // headers @hashpass/sdk's AuthQrClient sends -- see
    // packages/sdk/src/auth-qr/client.ts and src/routes/auth-qr.ts. Must be
    // mirrored here AND in the Terraform stack's cors_allow_headers: API
    // Gateway's native CORS support answers preflight OPTIONS itself before
    // Lambda runs, so this app-level header only covers actual (non-OPTIONS)
    // responses -- the Terraform config is what the browser's preflight
    // actually checks.
    headers['access-control-allow-headers'] = 'Content-Type, Authorization, Cache-Control, X-Hashpass-App-Id, X-Hashpass-Binding, Idempotency-Key';
  }
  if (resolvedOrigin !== '*' && !headers['access-control-allow-credentials']) {
    headers['access-control-allow-credentials'] = 'true';
  }

  return headers;
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === 'function') return withGetSetCookie.getSetCookie();

  const setCookie = headers.get('set-cookie');
  if (!setCookie) return [];
  return setCookie
    .split(/,\s*(?=[^;,]+=)/)
    .map((cookie) => cookie.trim())
    .filter(Boolean);
}

function buildRequestHeaders(event: ApiGatewayEvent): Headers {
  const headers = new Headers(event.headers || {});
  const hasCookieHeader = Boolean(getHeader(event.headers, 'cookie'));

  if (!hasCookieHeader && Array.isArray(event.cookies) && event.cookies.length > 0) {
    headers.set('cookie', event.cookies.join('; '));
  }

  return headers;
}

export async function handleLambdaEvent(event: ApiGatewayEvent | ScheduledEvent): Promise<ApiGatewayResponse> {
  try {
    if (event.source === 'aws.events' && event['detail-type'] === 'Scheduled Event') {
      const archived = await archiveExpiredQrLinks();
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived }),
        isBase64Encoded: false,
      };
    }

    const apiEvent = event as ApiGatewayEvent;
    const method = apiEvent.httpMethod || apiEvent.requestContext?.http?.method || apiEvent.requestContext?.httpMethod || 'GET';

    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: applyCorsHeaders({ 'access-control-max-age': '86400' }, apiEvent),
        body: '',
        isBase64Encoded: false,
      };
    }

    let requestPath = apiEvent.path || apiEvent.requestContext?.http?.path || apiEvent.requestContext?.path || '/';
    if (requestPath.startsWith('/prod/')) {
      requestPath = requestPath.replace('/prod', '');
    }

    const queryString =
      apiEvent.rawQueryString ||
      (apiEvent.queryStringParameters ? new URLSearchParams(apiEvent.queryStringParameters).toString() : '');

    const domainName = apiEvent.requestContext?.domainName || getHeader(apiEvent.headers, 'Host') || 'hashpass.link';
    const protocol = getHeader(apiEvent.headers, 'X-Forwarded-Proto') || 'https';
    const fullUrl = `${protocol}://${domainName}${requestPath}${queryString ? `?${queryString}` : ''}`;

    const request = new Request(fullUrl, {
      method,
      headers: buildRequestHeaders(apiEvent),
      body: apiEvent.body && method !== 'GET' && method !== 'HEAD' ? apiEvent.body : undefined,
    });

    const response = await handleRequest(request);

    const body = await response.text();
    const headers: Record<string, string> = {};
    const setCookieHeaders = getSetCookieHeaders(response.headers);

    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'content-encoding' && lowerKey !== 'transfer-encoding' && lowerKey !== 'set-cookie') {
        headers[lowerKey] = value;
      }
    });
    applyCorsHeaders(headers, apiEvent);

    const apiGatewayResponse: ApiGatewayResponse = {
      statusCode: response.status,
      headers,
      body,
      isBase64Encoded: false,
    };

    if (setCookieHeaders.length > 0) {
      if (apiEvent.version === '2.0') {
        apiGatewayResponse.cookies = setCookieHeaders;
      } else {
        apiGatewayResponse.multiValueHeaders = { 'set-cookie': setCookieHeaders };
      }
    }

    return apiGatewayResponse;
  } catch (error) {
    console.error(JSON.stringify({ event: 'hashpass_links_api_error', error: error instanceof Error ? error.message : String(error) }));

    return {
      statusCode: 500,
      headers: applyCorsHeaders({ 'content-type': 'application/json' }, event as ApiGatewayEvent),
      body: JSON.stringify({ error: 'Internal Server Error' }),
      isBase64Encoded: false,
    };
  }
}

export { handleLambdaEvent as handler };
