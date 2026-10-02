const API_HOSTS = new Set(['api.hashpass.tech', 'api-dev.hashpass.tech']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

// Provider-aware so an Apple sign-in failure doesn't get reported to the user
// as a "Google sign-in" error — the previous hardcoded copy blamed Google
// unconditionally for every provider's failure, which is actively misleading
// when e.g. Apple's form_post callback fails state validation (see the
// `advanced.defaultCookieAttributes` comment in `better-auth.ts`). Falls back
// to the generic "Sign-in" label when the provider can't be determined from
// the request (e.g. a direct hit on Better Auth's own /auth/error route).
const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  apple: 'Apple',
};

// `providerLabel` is null when the provider can't be determined (sentences
// below start with a capitalized "Sign-in" in that case); otherwise it's
// "Google"/"Apple" and sentences read "Google sign-in"/"Apple sign-in".
const withSubject = (providerLabel: string | null): string =>
  providerLabel ? `${providerLabel} sign-in` : 'Sign-in';

const AUTH_ERROR_MESSAGE_TEMPLATES: Record<string, (providerLabel: string | null) => string> = {
  state_mismatch: (p) => `${withSubject(p)} expired or could not be verified. Please try again.`,
  state_not_found: (p) => `${withSubject(p)} expired or could not be verified. Please try again.`,
  please_restart_the_process: (p) => `${withSubject(p)} expired or could not be verified. Please try again.`,
  invalid_code: (p) => `${withSubject(p)} could not be verified. Please try again.`,
  no_code: (p) => `${withSubject(p)} did not return a verification code. Please try again.`,
  oauth_provider_not_found: (p) => `${withSubject(p)} is not configured. Please contact support.`,
};

const parseUrl = (value?: string | null, base?: string): URL | null => {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed, base);
  } catch {
    return null;
  }
};

const normalizeHostname = (hostname?: string | null): string =>
  (hostname || '').split(':')[0].trim().toLowerCase();

const isApiHost = (hostname?: string | null): boolean => API_HOSTS.has(normalizeHostname(hostname));

const isLocalHost = (hostname?: string | null): boolean => {
  const normalized = normalizeHostname(hostname);
  return LOCAL_HOSTS.has(normalized) || normalized.endsWith('.local');
};

const isHashpassFrontendHost = (hostname?: string | null): boolean => {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === 'hashpass.tech' ||
    normalized === 'www.hashpass.tech' ||
    normalized.endsWith('.hashpass.tech') ||
    normalized === 'hashpass.co' ||
    normalized === 'www.hashpass.co' ||
    normalized.endsWith('.hashpass.co') ||
    normalized.endsWith('.hashpass.lat')
  );
};

const isSafeFrontendOrigin = (url: URL): boolean => {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (isApiHost(url.hostname)) return false;
  return isLocalHost(url.hostname) || isHashpassFrontendHost(url.hostname);
};

const readEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value || undefined;
};

const originFromHeader = (request: Request, headerName: string): string | null => {
  const value = request.headers.get(headerName);
  const parsed = parseUrl(value);
  return parsed && isSafeFrontendOrigin(parsed) ? parsed.origin : null;
};

const originFromEnv = (): string | null => {
  const candidates = [
    readEnv('EXPO_PUBLIC_FRONTEND_URL'),
    readEnv('FRONTEND_URL'),
    readEnv('EXPO_PUBLIC_SITE_URL'),
    readEnv('SITE_URL'),
  ];

  for (const candidate of candidates) {
    const parsed = parseUrl(candidate);
    if (parsed && isSafeFrontendOrigin(parsed)) {
      return parsed.origin;
    }
  }

  return null;
};

export const resolveBetterAuthErrorFrontendOrigin = (request: Request): string => {
  const requestUrl = parseUrl(request.url);
  if (requestUrl && isLocalHost(requestUrl.hostname)) {
    return requestUrl.origin;
  }

  const headerOrigin = originFromHeader(request, 'origin') || originFromHeader(request, 'referer');
  if (headerOrigin) return headerOrigin;

  const envOrigin = originFromEnv();
  if (envOrigin) return envOrigin;

  if (requestUrl && normalizeHostname(requestUrl.hostname) === 'api-dev.hashpass.tech') {
    return 'https://dev.hashpass.tech';
  }

  return 'https://hashpass.tech';
};

const getAuthErrorCode = (sourceUrl: URL): string => {
  return (
    sourceUrl.searchParams.get('error') ||
    sourceUrl.searchParams.get('reason') ||
    sourceUrl.searchParams.get('state') ||
    'oauth_failed'
  );
};

// The provider only ever appears in a /callback/<provider> path segment — the
// error itself happens while handling that callback request, before Better
// Auth's own /auth/error redirect (which carries no provider info) is built.
const getProviderLabel = (...urls: Array<URL | null>): string | null => {
  for (const url of urls) {
    const match = url?.pathname.match(/\/callback\/([a-z0-9_-]+)/i);
    const label = match?.[1] ? PROVIDER_LABELS[match[1].toLowerCase()] : undefined;
    if (label) return label;
  }
  return null;
};

const getAuthErrorMessage = (sourceUrl: URL, code: string, providerLabel: string | null): string => {
  return (
    sourceUrl.searchParams.get('message') ||
    sourceUrl.searchParams.get('error_description') ||
    AUTH_ERROR_MESSAGE_TEMPLATES[code]?.(providerLabel) ||
    `${withSubject(providerLabel)} failed. Please try again.`
  );
};

const getSafeReturnTo = (sourceUrl: URL): string | null => {
  const returnTo = sourceUrl.searchParams.get('returnTo');
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return null;
  }
  return returnTo;
};

export const buildBetterAuthErrorRedirectURL = (
  request: Request,
  sourceLocation?: string | null
): string => {
  const requestUrl = parseUrl(request.url) || new URL('https://hashpass.tech/');
  const sourceUrl = parseUrl(sourceLocation, requestUrl.href) || requestUrl;
  const code = getAuthErrorCode(sourceUrl);
  const providerLabel = getProviderLabel(requestUrl, sourceUrl);
  const message = getAuthErrorMessage(sourceUrl, code, providerLabel);
  const redirectUrl = new URL('/auth', resolveBetterAuthErrorFrontendOrigin(request));

  redirectUrl.searchParams.set('error', code);
  redirectUrl.searchParams.set('message', message);

  const returnTo = getSafeReturnTo(sourceUrl);
  if (returnTo) {
    redirectUrl.searchParams.set('returnTo', returnTo);
  }

  return redirectUrl.toString();
};

const hasAuthErrorParams = (url: URL): boolean =>
  url.searchParams.has('error') || url.searchParams.has('reason') || url.searchParams.has('state');

const isAuthRoutePath = (pathname: string): boolean => /\/auth(\/|$)/.test(pathname);

const isBetterAuthErrorPath = (pathname: string): boolean => /\/auth\/error\/?$/.test(pathname);

export const shouldRedirectBetterAuthErrorRequest = (request: Request): boolean => {
  const requestUrl = parseUrl(request.url);
  return Boolean(
    requestUrl &&
      isBetterAuthErrorPath(requestUrl.pathname) &&
      hasAuthErrorParams(requestUrl)
  );
};

const shouldRewriteLocation = (request: Request, location: string): boolean => {
  const requestUrl = parseUrl(request.url);
  const targetUrl = parseUrl(location, requestUrl?.href);
  if (!requestUrl || !targetUrl || !hasAuthErrorParams(targetUrl)) return false;

  if (isBetterAuthErrorPath(targetUrl.pathname)) return true;

  return targetUrl.pathname === '/' && isAuthRoutePath(requestUrl.pathname);
};

export const createBetterAuthErrorRedirect = (request: Request): Response | null => {
  if (!shouldRedirectBetterAuthErrorRequest(request)) return null;
  return Response.redirect(buildBetterAuthErrorRedirectURL(request), 302);
};

export const rewriteBetterAuthErrorRedirect = (
  request: Request,
  response: Response
): Response => {
  if (response.status < 300 || response.status > 399) return response;

  const location = response.headers.get('location');
  if (!location || !shouldRewriteLocation(request, location)) return response;

  const headers = new Headers(response.headers);
  headers.set('location', buildBetterAuthErrorRedirectURL(request, location));
  headers.set('cache-control', 'no-store');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
