import { Platform } from 'react-native';

export const SUPABASE_OAUTH_CALLBACK_PATH = '/auth/callback';
export const SUPABASE_OAUTH_NATIVE_SCHEME = 'hashpass';

type SupabaseOAuthRedirectOptions = {
  callbackPath?: string;
  origin?: string;
  platform?: string;
  scheme?: string;
  relayToNative?: boolean;
};

type ResolveWebOriginOptions = {
  allowLocal?: boolean;
};

const LOCAL_ORIGINS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

const normalizeCallbackPath = (callbackPath?: string) => {
  const trimmed = (callbackPath || SUPABASE_OAUTH_CALLBACK_PATH).trim();
  if (!trimmed) {
    return SUPABASE_OAUTH_CALLBACK_PATH;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const normalizeOrigin = (origin?: string) => {
  const trimmed = (origin || '').trim().replace(/\/$/, '');
  return trimmed;
};

const parseOrigin = (value?: string): string | null => {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin.replace(/\/$/, '');
  } catch {
    return null;
  }
};

const isLocalDevRuntime = (): boolean => {
  const env = String(process.env.EXPO_PUBLIC_ENV || process.env.NODE_ENV || '').toLowerCase();
  return ['local', 'development', 'dev', 'staging'].includes(env);
};

const isLocalOrigin = (value?: string | null): boolean => {
  const origin = parseOrigin(value || undefined);
  if (!origin) return false;

  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return LOCAL_ORIGINS.has(hostname) || hostname.endsWith('.local');
  } catch {
    return false;
  }
};

export const resolveWebOrigin = (options: ResolveWebOriginOptions = {}) => {
  const allowLocal = options.allowLocal ?? true;
  const isLocalDev = isLocalDevRuntime();
  const fallbackLocalOrigin = 'http://localhost:8081';
  const envCandidates = [
    typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_SITE_URL : '',
    typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_FRONTEND_URL : '',
    typeof process !== 'undefined' ? process.env.SITE_URL : '',
    typeof process !== 'undefined' ? process.env.FRONTEND_URL : '',
  ];

  const browserOrigin =
    typeof window !== 'undefined' ? parseOrigin(window.location?.origin) : null;
  const explicitEnvOrigin = envCandidates.map(parseOrigin).find(Boolean) || null;

  if (browserOrigin && !isLocalOrigin(browserOrigin)) {
    return normalizeOrigin(browserOrigin);
  }

  if (isLocalDev && allowLocal) {
    const localCandidates = [browserOrigin, explicitEnvOrigin].filter(
      (candidate): candidate is string => Boolean(candidate) && isLocalOrigin(candidate)
    );

    if (localCandidates[0]) {
      return normalizeOrigin(localCandidates[0]);
    }
  }

  if (explicitEnvOrigin && !isLocalOrigin(explicitEnvOrigin)) {
    return normalizeOrigin(explicitEnvOrigin);
  }

  if (isLocalDev && allowLocal) {
    return normalizeOrigin(fallbackLocalOrigin);
  }

  const productionCandidates = [
    browserOrigin,
    explicitEnvOrigin,
    parseOrigin('https://hashpass.tech'),
  ].filter((candidate): candidate is string => Boolean(candidate) && !isLocalOrigin(candidate));

  return normalizeOrigin(productionCandidates[0] || 'https://hashpass.tech');
};

const normalizeScheme = (scheme?: string) => {
  const trimmed = (scheme || SUPABASE_OAUTH_NATIVE_SCHEME).trim();
  return trimmed || SUPABASE_OAUTH_NATIVE_SCHEME;
};

export const getSupabaseOAuthRedirectUrl = (options: SupabaseOAuthRedirectOptions = {}) => {
  const callbackPath = normalizeCallbackPath(options.callbackPath);
  const platform = options.platform || Platform.OS;
  const relayToNative = Boolean(options.relayToNative);

  if (platform === 'web' || relayToNative) {
    const explicitOrigin = parseOrigin(options.origin);
    const origin = explicitOrigin || resolveWebOrigin({ allowLocal: !relayToNative });

    return origin ? `${origin}${callbackPath}` : callbackPath;
  }

  const scheme = normalizeScheme(options.scheme);
  return `${scheme}://${callbackPath.replace(/^\//, '')}`;
};
