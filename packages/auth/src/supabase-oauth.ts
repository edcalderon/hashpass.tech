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
    // React Native polyfills may return the string "null" — treat it as absent.
    if (origin && origin !== 'null') {
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

  return normalizeOrigin(envOrigin);
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
