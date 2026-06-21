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

const resolveWebOrigin = () => {
  if (typeof window !== 'undefined') {
    const origin = window.location?.origin;
    // React Native polyfills window but set location.origin to "null" or a
    // localhost URL (Metro bundler). Neither is a valid redirect origin for OAuth.
    const isUnusableOrigin =
      !origin ||
      origin === 'null' ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

    if (!isUnusableOrigin) {
      return normalizeOrigin(origin);
    }
  }

  // Pick the first env var that is an HTTPS, non-localhost URL.
  // Localhost values are unusable: Supabase rejects them as emailRedirectTo and
  // falls back to the dashboard site URL (which may also be localhost).
  const isUsableHttpsOrigin = (v?: string): boolean => {
    if (!v) return false;
    return v.startsWith('https://') && !/localhost|127\.0\.0\.1/.test(v);
  };

  const envOrigin = typeof process !== 'undefined'
    ? [
        process.env.EXPO_PUBLIC_SITE_URL,
        process.env.EXPO_PUBLIC_FRONTEND_URL,
        process.env.SITE_URL,
        process.env.FRONTEND_URL,
      ].find(isUsableHttpsOrigin) || ''
    : '';

  // Fall back to production URL when no usable env var is available (dev builds,
  // CI environments where EXPO_PUBLIC_SITE_URL is not baked in, etc.).
  return normalizeOrigin(envOrigin || 'https://hashpass.tech');
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
    const origin = normalizeOrigin(options.origin || resolveWebOrigin());
    return origin ? `${origin}${callbackPath}` : callbackPath;
  }

  const scheme = normalizeScheme(options.scheme);
  return `${scheme}://${callbackPath.replace(/^\//, '')}`;
};
