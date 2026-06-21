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

  const envOrigin =
    typeof process !== 'undefined'
      ? process.env.EXPO_PUBLIC_SITE_URL ||
        process.env.EXPO_PUBLIC_FRONTEND_URL ||
        process.env.SITE_URL ||
        process.env.FRONTEND_URL ||
        ''
      : '';

  // When no env var is set (common in native builds where EXPO_PUBLIC_SITE_URL may
  // not be baked in), fall back to the production URL so Supabase emails contain a
  // clickable link instead of a localhost URL from the dashboard's site URL config.
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
