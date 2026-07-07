const LOCAL_ORIGINS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const TRUSTED_FRONTEND_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  'hashpass.tech',
  'hashpass.co',
  'hashpass.lat',
]);
const TRUSTED_FRONTEND_SUFFIXES = ['.hashpass.tech', '.hashpass.co', '.hashpass.lat'];

const isLocalDevRuntime = (): boolean => {
  const envSource = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  const env = String(envSource?.EXPO_PUBLIC_ENV || envSource?.NODE_ENV || '').toLowerCase();
  return ['local', 'development', 'dev', 'staging'].includes(env);
};

const normalizeHostname = (value: string): string => value.trim().toLowerCase();

export const extractOrigin = (rawValue: string | null | undefined): string | null => {
  if (!rawValue) return null;

  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
};

export const isLocalOrigin = (origin: string): boolean => {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return LOCAL_ORIGINS.has(hostname) || hostname.endsWith('.local');
  } catch {
    return false;
  }
};

export const isApiHostname = (hostname: string): boolean => {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === 'api.hashpass.tech' ||
    normalized === 'api-dev.hashpass.tech' ||
    normalized.startsWith('api.') ||
    normalized.startsWith('api-')
  );
};

export const isTrustedFrontendOrigin = (origin: string): boolean => {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    if (isApiHostname(hostname)) return false;

    if (isLocalDevRuntime()) {
      return LOCAL_ORIGINS.has(hostname) || hostname.endsWith('.local');
    }

    if (TRUSTED_FRONTEND_HOSTS.has(hostname)) return true;
    return TRUSTED_FRONTEND_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
};

export const deriveFrontendOriginFromRequest = (request: Request): string | null => {
  try {
    const url = new URL(request.url);
    const hostname = normalizeHostname(url.hostname);
    if (!isApiHostname(hostname)) {
      return null;
    }

    const frontendHostname = hostname.replace(/^api[.-]/, '');
    if (!frontendHostname || frontendHostname === hostname) {
      return null;
    }

    return `${url.protocol}//${frontendHostname}`;
  } catch {
    return null;
  }
};

type ResolveFrontendOriginOptions = {
  request: Request;
  candidates?: Array<string | null | undefined>;
  fallbackOrigin: string;
};

export const resolveFrontendOrigin = ({
  request,
  candidates = [],
  fallbackOrigin,
}: ResolveFrontendOriginOptions): string => {
  for (const candidate of candidates) {
    const origin = extractOrigin(candidate);
    if (origin && isTrustedFrontendOrigin(origin)) {
      return origin;
    }
  }

  const derivedOrigin = deriveFrontendOriginFromRequest(request);
  if (derivedOrigin && isTrustedFrontendOrigin(derivedOrigin)) {
    return derivedOrigin;
  }

  const fallback = extractOrigin(fallbackOrigin);
  if (fallback && isTrustedFrontendOrigin(fallback)) {
    return fallback;
  }

  return fallbackOrigin;
};
