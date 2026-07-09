const API_HOSTS = new Set(['api.hashpass.tech', 'api-dev.hashpass.tech']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  state_mismatch: 'Google sign-in expired or could not be verified. Please try again.',
  state_not_found: 'Google sign-in expired or could not be verified. Please try again.',
  please_restart_the_process: 'Google sign-in expired or could not be verified. Please try again.',
  invalid_code: 'Google sign-in could not be verified. Please try again.',
  no_code: 'Google sign-in did not return a verification code. Please try again.',
  oauth_provider_not_found: 'Google sign-in is not configured. Please contact support.',
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

const getAuthErrorMessage = (sourceUrl: URL, code: string): string => {
  return (
    sourceUrl.searchParams.get('message') ||
    sourceUrl.searchParams.get('error_description') ||
    AUTH_ERROR_MESSAGES[code] ||
    'Google sign-in failed. Please try again.'
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
  const message = getAuthErrorMessage(sourceUrl, code);
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
