/**
 * Authentication provider factory
 */

import { IAuthProvider, AuthProviderConfig } from './types';
import { DirectusAuthProvider } from './providers/directus';
import { SupabaseAuthProvider } from './providers/supabase';
import { BetterAuthProvider } from './providers/better-auth';
import { ENV_CONFIG } from '@hashpass/config';
import { Platform } from 'react-native';

type AuthProviderRuntimeOptions = {
  hostname?: string | null;
};

const envValue = (name: string): string | undefined => {
  switch (name) {
    case 'AUTH_PROVIDER':
      return process.env.AUTH_PROVIDER;
    case 'EXPO_PUBLIC_SITE_URL':
      return process.env.EXPO_PUBLIC_SITE_URL;
    case 'SITE_URL':
      return process.env.SITE_URL;
    case 'FRONTEND_URL':
      return process.env.FRONTEND_URL;
    case 'EXPO_PUBLIC_SUPABASE_PROFILE':
      return process.env.EXPO_PUBLIC_SUPABASE_PROFILE;
    case 'SUPABASE_PROFILE':
      return process.env.SUPABASE_PROFILE;
    case 'EXPO_PUBLIC_SUPABASE_URL':
      return process.env.EXPO_PUBLIC_SUPABASE_URL;
    case 'EXPO_PUBLIC_SUPABASE_URL_DEV':
      return process.env.EXPO_PUBLIC_SUPABASE_URL_DEV;
    case 'EXPO_PUBLIC_SUPABASE_URL_PROD':
      return process.env.EXPO_PUBLIC_SUPABASE_URL_PROD;
    case 'EXPO_PUBLIC_SUPABASE_URL_BSL_DEV':
      return process.env.EXPO_PUBLIC_SUPABASE_URL_BSL_DEV;
    case 'EXPO_PUBLIC_SUPABASE_URL_BSL_PROD':
      return process.env.EXPO_PUBLIC_SUPABASE_URL_BSL_PROD;
    case 'EXPO_PUBLIC_BSL_SUPABASE_URL':
      return process.env.EXPO_PUBLIC_BSL_SUPABASE_URL;
    case 'EXPO_PUBLIC_BSL_SUPABASE_URL_DEV':
      return process.env.EXPO_PUBLIC_BSL_SUPABASE_URL_DEV;
    case 'EXPO_PUBLIC_BSL_SUPABASE_URL_PROD':
      return process.env.EXPO_PUBLIC_BSL_SUPABASE_URL_PROD;
    case 'NEXT_PUBLIC_SUPABASE_URL':
      return process.env.NEXT_PUBLIC_SUPABASE_URL;
    case 'EXPO_PUBLIC_SUPABASE_KEY':
      return process.env.EXPO_PUBLIC_SUPABASE_KEY;
    case 'EXPO_PUBLIC_SUPABASE_KEY_DEV':
      return process.env.EXPO_PUBLIC_SUPABASE_KEY_DEV;
    case 'EXPO_PUBLIC_SUPABASE_KEY_PROD':
      return process.env.EXPO_PUBLIC_SUPABASE_KEY_PROD;
    case 'EXPO_PUBLIC_SUPABASE_KEY_BSL_DEV':
      return process.env.EXPO_PUBLIC_SUPABASE_KEY_BSL_DEV;
    case 'EXPO_PUBLIC_SUPABASE_KEY_BSL_PROD':
      return process.env.EXPO_PUBLIC_SUPABASE_KEY_BSL_PROD;
    case 'EXPO_PUBLIC_SUPABASE_ANON_KEY':
      return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    case 'EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV':
      return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV;
    case 'EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD':
      return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD;
    case 'EXPO_PUBLIC_SUPABASE_ANON_KEY_BSL_DEV':
      return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_BSL_DEV;
    case 'EXPO_PUBLIC_SUPABASE_ANON_KEY_BSL_PROD':
      return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_BSL_PROD;
    case 'EXPO_PUBLIC_BSL_SUPABASE_KEY':
      return process.env.EXPO_PUBLIC_BSL_SUPABASE_KEY;
    case 'EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV':
      return process.env.EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV;
    case 'EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD':
      return process.env.EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD;
    case 'EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY':
      return process.env.EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY;
    case 'EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_DEV':
      return process.env.EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_DEV;
    case 'EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_PROD':
      return process.env.EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_PROD;
    case 'NEXT_PUBLIC_SUPABASE_ANON_KEY':
      return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    case 'EXPO_PUBLIC_DIRECTUS_URL':
      return process.env.EXPO_PUBLIC_DIRECTUS_URL;
    case 'DIRECTUS_URL':
      return process.env.DIRECTUS_URL;
    case 'EXPO_PUBLIC_BETTER_AUTH_BASE_PATH':
      return process.env.EXPO_PUBLIC_BETTER_AUTH_BASE_PATH;
    case 'BETTER_AUTH_BASE_PATH':
      return process.env.BETTER_AUTH_BASE_PATH;
    default:
      if (typeof process === 'undefined') return undefined;
      return process.env?.[name];
  }
};

const STATIC_ENV: Record<string, string | undefined> = {
  AUTH_PROVIDER: envValue('AUTH_PROVIDER'),
  EXPO_PUBLIC_SITE_URL: envValue('EXPO_PUBLIC_SITE_URL'),
  SITE_URL: envValue('SITE_URL'),
  FRONTEND_URL: envValue('FRONTEND_URL'),
  EXPO_PUBLIC_SUPABASE_PROFILE: envValue('EXPO_PUBLIC_SUPABASE_PROFILE'),
  SUPABASE_PROFILE: envValue('SUPABASE_PROFILE'),
  EXPO_PUBLIC_SUPABASE_URL: envValue('EXPO_PUBLIC_SUPABASE_URL'),
  EXPO_PUBLIC_SUPABASE_URL_DEV: envValue('EXPO_PUBLIC_SUPABASE_URL_DEV'),
  EXPO_PUBLIC_SUPABASE_URL_PROD: envValue('EXPO_PUBLIC_SUPABASE_URL_PROD'),
  EXPO_PUBLIC_SUPABASE_URL_BSL_DEV: envValue('EXPO_PUBLIC_SUPABASE_URL_BSL_DEV'),
  EXPO_PUBLIC_SUPABASE_URL_BSL_PROD: envValue('EXPO_PUBLIC_SUPABASE_URL_BSL_PROD'),
  EXPO_PUBLIC_BSL_SUPABASE_URL: envValue('EXPO_PUBLIC_BSL_SUPABASE_URL'),
  EXPO_PUBLIC_BSL_SUPABASE_URL_DEV: envValue('EXPO_PUBLIC_BSL_SUPABASE_URL_DEV'),
  EXPO_PUBLIC_BSL_SUPABASE_URL_PROD: envValue('EXPO_PUBLIC_BSL_SUPABASE_URL_PROD'),
  NEXT_PUBLIC_SUPABASE_URL: envValue('NEXT_PUBLIC_SUPABASE_URL'),
  EXPO_PUBLIC_SUPABASE_KEY: envValue('EXPO_PUBLIC_SUPABASE_KEY'),
  EXPO_PUBLIC_SUPABASE_KEY_DEV: envValue('EXPO_PUBLIC_SUPABASE_KEY_DEV'),
  EXPO_PUBLIC_SUPABASE_KEY_PROD: envValue('EXPO_PUBLIC_SUPABASE_KEY_PROD'),
  EXPO_PUBLIC_SUPABASE_KEY_BSL_DEV: envValue('EXPO_PUBLIC_SUPABASE_KEY_BSL_DEV'),
  EXPO_PUBLIC_SUPABASE_KEY_BSL_PROD: envValue('EXPO_PUBLIC_SUPABASE_KEY_BSL_PROD'),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: envValue('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV: envValue('EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV'),
  EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD: envValue('EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD'),
  EXPO_PUBLIC_SUPABASE_ANON_KEY_BSL_DEV: envValue('EXPO_PUBLIC_SUPABASE_ANON_KEY_BSL_DEV'),
  EXPO_PUBLIC_SUPABASE_ANON_KEY_BSL_PROD: envValue('EXPO_PUBLIC_SUPABASE_ANON_KEY_BSL_PROD'),
  EXPO_PUBLIC_BSL_SUPABASE_KEY: envValue('EXPO_PUBLIC_BSL_SUPABASE_KEY'),
  EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV: envValue('EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV'),
  EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD: envValue('EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD'),
  EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY: envValue('EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY'),
  EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_DEV: envValue('EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_DEV'),
  EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_PROD: envValue('EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_PROD'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: envValue('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  EXPO_PUBLIC_DIRECTUS_URL: envValue('EXPO_PUBLIC_DIRECTUS_URL'),
  DIRECTUS_URL: envValue('DIRECTUS_URL'),
  EXPO_PUBLIC_BETTER_AUTH_BASE_PATH: envValue('EXPO_PUBLIC_BETTER_AUTH_BASE_PATH'),
  BETTER_AUTH_BASE_PATH: envValue('BETTER_AUTH_BASE_PATH'),
};

const normalizeHostname = (value?: string | null): string => {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return '';

  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return raw.split('/')[0].split(':')[0].toLowerCase();
  }
};

const readProcessEnv = (name: string): string | undefined => {
  const staticValue = STATIC_ENV[name];
  if (typeof staticValue === 'string') {
    const trimmed = staticValue.trim();
    return trimmed.length ? trimmed : undefined;
  }

  if (typeof process === 'undefined') return undefined;
  const value = process.env?.[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const firstEnv = (names: string[]): string | undefined => {
  for (const name of names) {
    const value = readProcessEnv(name);
    if (value) return value;
  }
  return undefined;
};

const LEGACY_BETTER_AUTH_SEGMENT = ['bsl', 'auth'].join('-');

const normalizeBetterAuthBasePath = (value?: string | null): string => {
  const trimmed = (value || '/api/auth').trim();
  if (!trimmed) return '/api/auth';

  const normalized = trimmed.startsWith('/') ? trimmed.replace(/\/$/, '') : `/${trimmed.replace(/\/$/, '')}`;
  return normalized.replace(new RegExp(`/${LEGACY_BETTER_AUTH_SEGMENT}$`), '/auth');
};

const resolveRuntimeHostname = (hostname?: string | null): string => {
  const explicit = normalizeHostname(hostname);
  if (explicit) return explicit;

  if (typeof window !== 'undefined' && window.location?.hostname) {
    return normalizeHostname(window.location.hostname);
  }

  return normalizeHostname(
    readProcessEnv('EXPO_PUBLIC_SITE_URL') ||
      readProcessEnv('SITE_URL') ||
      readProcessEnv('FRONTEND_URL') ||
      ''
  );
};

const resolveProviderName = (hostname?: string | null): AuthProviderConfig['provider'] => {
  const resolvedHostname = resolveRuntimeHostname(hostname);
  const explicitProvider = readProcessEnv('AUTH_PROVIDER') as AuthProviderConfig['provider'] | undefined;
  const tenantProvider = ENV_CONFIG.getTenant(resolvedHostname).authProvider as
    | AuthProviderConfig['provider']
    | undefined;
  const supabaseCredentials = resolveSupabaseCredentials(resolvedHostname);
  const hasSupabaseCredentials = Boolean(supabaseCredentials.url && supabaseCredentials.anonKey);
  const isNativeReactRuntime = Platform.OS !== 'web';

  // Native core builds can still land with the Directus default if AUTH_PROVIDER
  // was not injected. When Supabase public credentials are available, prefer it
  // on React Native so passwordless and browser-based Google sign-in work.
  // Explicit AUTH_PROVIDER=directus bypasses this so native can use Directus OAuth.
  if (
    isNativeReactRuntime &&
    hasSupabaseCredentials &&
    tenantProvider !== 'better-auth' &&
    explicitProvider !== 'better-auth' &&
    explicitProvider !== 'directus'
  ) {
    return 'supabase';
  }

  if (tenantProvider && tenantProvider !== 'directus') {
    return tenantProvider;
  }

  if (explicitProvider) return explicitProvider;

  return tenantProvider || 'directus';
};

const resolveSupabaseCredentials = (hostname?: string | null) => {
  const resolvedHostname = resolveRuntimeHostname(hostname);
  const supabaseProfile = firstEnv(['EXPO_PUBLIC_SUPABASE_PROFILE', 'SUPABASE_PROFILE']);
  const isBslProfile = Boolean(supabaseProfile && /^bsl(?:-|$)/i.test(supabaseProfile));
  const isBsl = isBslProfile || ENV_CONFIG.getTenant(resolvedHostname).slug !== 'main';

  const url = isBsl
    ? firstEnv([
        'EXPO_PUBLIC_BSL_SUPABASE_URL_PROD',
        'EXPO_PUBLIC_SUPABASE_URL_BSL_PROD',
        'EXPO_PUBLIC_BSL_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_URL',
        'EXPO_PUBLIC_SUPABASE_URL_PROD',
        'EXPO_PUBLIC_SUPABASE_URL',
      ])
    : firstEnv([
        'NEXT_PUBLIC_SUPABASE_URL',
        'EXPO_PUBLIC_SUPABASE_URL',
        'EXPO_PUBLIC_SUPABASE_URL_PROD',
      ]);

  const anonKey = isBsl
    ? firstEnv([
        'EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD',
        'EXPO_PUBLIC_SUPABASE_KEY_BSL_PROD',
        'EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_PROD',
        'EXPO_PUBLIC_BSL_SUPABASE_KEY',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'EXPO_PUBLIC_SUPABASE_KEY_PROD',
        'EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD',
        'EXPO_PUBLIC_SUPABASE_KEY',
      ])
    : firstEnv([
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'EXPO_PUBLIC_SUPABASE_ANON_KEY',
        'EXPO_PUBLIC_SUPABASE_KEY',
      ]);

  return { url: url || '', anonKey: anonKey || '' };
};

const resolveBetterAuthBaseURL = (hostname?: string | null): string => {
  const apiBaseUrl = ENV_CONFIG.getApiUrl(hostname || undefined).replace(/\/$/, '');
  return `${apiBaseUrl}/auth`;
};

export function resolveAuthProviderConfig(
  options: AuthProviderRuntimeOptions = {}
): AuthProviderConfig {
  const provider = resolveProviderName(options.hostname);
  const directusUrl =
    firstEnv(['EXPO_PUBLIC_DIRECTUS_URL', 'DIRECTUS_URL']) || 'https://sso.hashpass.co';

  return {
    provider,
    directus: {
      url: directusUrl,
      adminEmail: readProcessEnv('DIRECTUS_ADMIN_EMAIL') || 'admin@hashpass.tech',
    },
    supabase: resolveSupabaseCredentials(options.hostname),
    betterAuth: {
      baseURL: resolveBetterAuthBaseURL(options.hostname),
      basePath: normalizeBetterAuthBasePath(
        firstEnv(['EXPO_PUBLIC_BETTER_AUTH_BASE_PATH', 'BETTER_AUTH_BASE_PATH'])
      ),
    },
  };
}

/**
 * Create an authentication provider based on configuration
 */
export function createAuthProvider(config: AuthProviderConfig): IAuthProvider {
  switch (config.provider) {
    case 'directus':
      if (!config.directus?.url) {
        throw new Error('Directus URL is required');
      }
      return new DirectusAuthProvider(config.directus.url);

    case 'supabase':
      if (!config.supabase?.url || !config.supabase?.anonKey) {
        throw new Error('Supabase URL and anonymous key are required');
      }
      return new SupabaseAuthProvider(config.supabase.url, config.supabase.anonKey);

    case 'better-auth':
      return new BetterAuthProvider(config.betterAuth);

    case 'keycloak':
      throw new Error('Keycloak provider not implemented yet');

    default:
      throw new Error(`Unknown auth provider: ${config.provider}`);
  }
}

/**
 * Create auth provider from environment variables
 */
export function createAuthProviderFromEnv(options: AuthProviderRuntimeOptions = {}): IAuthProvider {
  return createAuthProvider(resolveAuthProviderConfig(options));
}
