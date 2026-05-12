/**
 * Authentication provider factory
 */

import { IAuthProvider, AuthProviderConfig } from './types';
import { DirectusAuthProvider } from './providers/directus';
import { SupabaseAuthProvider } from './providers/supabase';
import { BetterAuthProvider } from './providers/better-auth';
import { ENV_CONFIG } from '@hashpass/config';

type AuthProviderRuntimeOptions = {
  hostname?: string | null;
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

const readBrowserGlobal = (name: string): string | undefined => {
  if (typeof window === 'undefined') return undefined;

  const value = (window as unknown as Record<string, unknown>)[name];
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const LEGACY_BETTER_AUTH_SEGMENT = ['bsl', 'auth'].join('-');

const normalizeBetterAuthBasePath = (value?: string | null): string => {
  const trimmed = (value || '/api/auth').trim();
  if (!trimmed) return '/api/auth';

  const normalized = trimmed.startsWith('/') ? trimmed.replace(/\/$/, '') : `/${trimmed.replace(/\/$/, '')}`;
  return normalized.replace(new RegExp(`/${LEGACY_BETTER_AUTH_SEGMENT}$`), '/auth');
};

const normalizeBetterAuthBaseURL = (value?: string | null): string | undefined => {
  const trimmed = (value || '').trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.replace(/\/$/, '');
  return normalized.replace(new RegExp(`/${LEGACY_BETTER_AUTH_SEGMENT}$`), '/auth');
};

const resolveRuntimeHostname = (hostname?: string | null): string => {
  const explicit = normalizeHostname(hostname);
  if (explicit) return explicit;

  if (typeof window !== 'undefined') {
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

  if (tenantProvider && tenantProvider !== 'directus') {
    return tenantProvider;
  }

  if (explicitProvider) return explicitProvider;

  return tenantProvider || 'directus';
};

const resolveSupabaseCredentials = (hostname?: string | null) => {
  const resolvedHostname = resolveRuntimeHostname(hostname);
  const isBsl = ENV_CONFIG.getTenant(resolvedHostname).slug !== 'main';

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

const resolveBetterAuthBaseURL = (): string | undefined => {
  const explicit = firstEnv(['EXPO_PUBLIC_BETTER_AUTH_URL', 'BETTER_AUTH_URL']);
  if (explicit) return normalizeBetterAuthBaseURL(explicit);

  const runtimeBetterAuthURL = readBrowserGlobal('__BETTER_AUTH_URL__');
  if (runtimeBetterAuthURL) return normalizeBetterAuthBaseURL(runtimeBetterAuthURL);

  const runtimeApiBase = readBrowserGlobal('__API_BASE_URL__');
  if (runtimeApiBase) {
    return `${runtimeApiBase.replace(/\/$/, '')}/auth`;
  }

  const apiBaseURL = firstEnv(['EXPO_PUBLIC_API_BASE_URL', 'NEXT_PUBLIC_API_BASE_URL']);
  if (!apiBaseURL) return undefined;

  return `${apiBaseURL.replace(/\/$/, '')}/auth`;
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
      baseURL: resolveBetterAuthBaseURL(),
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
