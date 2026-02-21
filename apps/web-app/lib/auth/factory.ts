/**
 * Authentication provider factory
 */

import { IAuthProvider, AuthProviderConfig } from './types';
import { DirectusAuthProvider } from './providers/directus';
import { SupabaseAuthProvider } from './providers/supabase';

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

    case 'keycloak':
      throw new Error('Keycloak provider not implemented yet');

    default:
      throw new Error(`Unknown auth provider: ${config.provider}`);
  }
}

/**
 * Create auth provider from environment variables
 */
export function createAuthProviderFromEnv(): IAuthProvider {
  const provider = (process.env.AUTH_PROVIDER || 'directus') as AuthProviderConfig['provider'];
  const directusUrl =
    process.env.EXPO_PUBLIC_DIRECTUS_URL ||
    process.env.DIRECTUS_URL ||
    'https://sso.hashpass.co';

  const config: AuthProviderConfig = {
    provider,
    directus: {
      url: directusUrl,
      adminEmail: process.env.DIRECTUS_ADMIN_EMAIL || 'admin@hashpass.tech'
    },
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
    }
  };

  console.log('🏗️ createAuthProviderFromEnv initializing with Directus URL:', directusUrl);
  return createAuthProvider(config);
}
