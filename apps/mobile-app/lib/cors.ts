import type { CorsHeaders, CorsOptions } from '../types/cors.types';

export const DEFAULT_CORS_ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:8081',
  'http://localhost:5173',
  'https://hashpass.tech',
  'https://www.hashpass.tech',
  'https://dev.hashpass.tech',
  'https://lukas.hashpass.tech',
  'https://bsl.hashpass.tech',
  'https://bsl-dev.hashpass.tech',
  'https://bsl2025.hashpass.tech',
  'https://blockchainsummit.hashpass.lat',
  'https://blockchainsummit-dev.hashpass.lat',
  'https://cbweek2026.hashpass.tech',
  'https://cbweek.hashpass.tech',
  'https://companion.hashpass.tech',
  'https://companion-dev.hashpass.tech',
] as const;

export const LUKAS_CORS_ALLOWED_ORIGINS = [
  'https://lukas.hashpass.tech',
] as const;

export const MCP_CONSENT_CORS_ALLOWED_ORIGINS = [
  'https://hashpass.tech',
  'https://www.hashpass.tech',
  'https://dev.hashpass.tech',
  'http://localhost:8081',
] as const;

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] as const;
const DEFAULT_HEADERS = ['Content-Type', 'Authorization'] as const;
const CORS_ORIGIN_ENV_VARS = ['CORS_ALLOW_ORIGINS', 'API_CORS_ORIGINS', 'BETTER_AUTH_TRUSTED_ORIGINS'] as const;

const splitCsv = (value: string | undefined) => String(value || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const normalizeOrigin = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === '*') return trimmed;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
};

const configuredOrigins = () => [
  ...DEFAULT_CORS_ALLOWED_ORIGINS,
  ...CORS_ORIGIN_ENV_VARS.flatMap((name) => splitCsv(process.env[name])),
];

const resolveAllowedOrigin = (request: Request | undefined, options: CorsOptions) => {
  const requestOrigin = request?.headers?.get?.('origin')?.trim() || '';
  if (!requestOrigin) return null;

  const normalizedOrigin = normalizeOrigin(requestOrigin);
  if (!normalizedOrigin) return null;

  const allowedOrigins = new Set(
    (options.allowedOrigins ?? configuredOrigins())
      .map(normalizeOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  );
  if (allowedOrigins.has(normalizedOrigin)) return normalizedOrigin;

  // Wildcards are intentionally limited to non-credentialed routes. A
  // credentialed response must always name an origin from the allowlist.
  return allowedOrigins.has('*') && !options.allowCredentials ? '*' : null;
};

export function getCorsHeaders(request?: Request, options: CorsOptions = {}): CorsHeaders {
  const headers: CorsHeaders = {
    'Access-Control-Allow-Methods': (options.methods ?? DEFAULT_METHODS).join(', '),
    'Access-Control-Allow-Headers': (options.allowedHeaders ?? DEFAULT_HEADERS).join(', '),
    Vary: 'Origin',
  };
  const allowedOrigin = resolveAllowedOrigin(request, options);

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    if (options.allowCredentials) headers['Access-Control-Allow-Credentials'] = 'true';
  }
  if (options.exposedHeaders?.length) {
    headers['Access-Control-Expose-Headers'] = options.exposedHeaders.join(', ');
  }
  if (options.maxAge !== undefined) headers['Access-Control-Max-Age'] = String(options.maxAge);

  return headers;
}

export function createCorsPreflightResponse(request?: Request, options: CorsOptions = {}): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, options),
  });
}

export function withCors(response: Response, request: Request | undefined, options: CorsOptions = {}): Response {
  const headers = new Headers(response.headers);
  Object.entries(getCorsHeaders(request, options)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
