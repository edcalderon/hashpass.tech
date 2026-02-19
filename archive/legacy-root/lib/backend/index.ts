/**
 * Backend Provider Factory
 * 
 * Creates and returns the appropriate backend provider based on configuration.
 * This is the main entry point for the backend abstraction layer.
 * 
 * Usage:
 * ```typescript
 * import { getBackend } from '@/lib/backend';
 * 
 * const backend = getBackend();
 * const { data, error } = await backend.auth.getSession();
 * const users = await backend.db.from('users').select().eq('active', true);
 * ```
 * 
 * Environment Variables:
 * - EXPO_PUBLIC_BACKEND_PROVIDER: 'supabase' (default) or 'directus'
 * - EXPO_PUBLIC_SUPABASE_URL: Supabase project URL
 * - EXPO_PUBLIC_SUPABASE_KEY: Supabase anon key
 * - EXPO_PUBLIC_DIRECTUS_URL: Directus API URL (for directus provider)
 * - EXPO_PUBLIC_DIRECTUS_TOKEN: Directus static token (optional)
 */

import type { BackendProvider } from './types';
import type { IBackendProvider } from './interfaces';

// Lazy-loaded provider instances
let supabaseProvider: IBackendProvider | null = null;
let directusProvider: IBackendProvider | null = null;
let currentProvider: IBackendProvider | null = null;

// Get the configured provider type
export function getProviderType(): BackendProvider {
  const provider = process.env.EXPO_PUBLIC_BACKEND_PROVIDER as BackendProvider;
  return provider === 'directus' ? 'directus' : 'supabase';
}

/**
 * Get the Supabase backend provider
 * Uses lazy initialization to avoid loading Supabase SDK if not needed
 */
async function getSupabaseProvider(): Promise<IBackendProvider> {
  if (supabaseProvider) {
    return supabaseProvider;
  }
  
  // Dynamic import to allow tree-shaking if not used
  const { SupabaseBackendProvider } = await import('./supabase');
  const { supabase } = await import('../supabase');
  
  // Try to get service role client for admin operations (server-side only)
  let serviceRoleClient;
  if (typeof window === 'undefined') {
    try {
      const { supabaseServer } = await import('../supabase-server');
      serviceRoleClient = supabaseServer;
    } catch {
      // Service role client not available
    }
  }
  
  supabaseProvider = new SupabaseBackendProvider(supabase, serviceRoleClient);
  return supabaseProvider;
}

/**
 * Get the Directus backend provider
 * Uses lazy initialization
 */
async function getDirectusProvider(): Promise<IBackendProvider> {
  if (directusProvider) {
    return directusProvider;
  }
  
  const { DirectusBackendProvider } = await import('./directus');
  
  const baseUrl = process.env.EXPO_PUBLIC_DIRECTUS_URL;
  const staticToken = process.env.EXPO_PUBLIC_DIRECTUS_TOKEN;
  
  if (!baseUrl) {
    throw new Error('EXPO_PUBLIC_DIRECTUS_URL is required for Directus provider');
  }
  
  directusProvider = new DirectusBackendProvider({
    baseUrl,
    staticToken,
  });
  
  await directusProvider.initialize();
  return directusProvider;
}

/**
 * Get the backend provider (async version)
 * Use this when you need the full provider with initialization
 */
export async function getBackendAsync(): Promise<IBackendProvider> {
  if (currentProvider) {
    return currentProvider;
  }
  
  const providerType = getProviderType();
  
  if (providerType === 'directus') {
    currentProvider = await getDirectusProvider();
  } else {
    currentProvider = await getSupabaseProvider();
  }
  
  return currentProvider;
}

/**
 * Get the backend provider (sync version)
 * Returns the cached provider or initializes Supabase synchronously
 * 
 * IMPORTANT: This is a synchronous fallback that always returns Supabase.
 * For Directus support, use getBackendAsync() instead.
 */
export function getBackend(): IBackendProvider {
  if (currentProvider) {
    return currentProvider;
  }
  
  // For synchronous access, we can only return Supabase
  // because Directus requires async initialization
  const providerType = getProviderType();
  
  if (providerType === 'directus') {
    console.warn('getBackend() called but Directus requires async initialization. Use getBackendAsync() instead.');
  }
  
  // Initialize Supabase synchronously
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { SupabaseBackendProvider } = require('./supabase');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { supabase } = require('../supabase');
  
  supabaseProvider = new SupabaseBackendProvider(supabase);
  currentProvider = supabaseProvider;
  
  return currentProvider!;
}

/**
 * Reset the provider (useful for testing or provider switching)
 */
export function resetProvider(): void {
  currentProvider = null;
  supabaseProvider = null;
  directusProvider = null;
}

/**
 * Check if using Supabase provider
 */
export function isSupabase(): boolean {
  return getProviderType() === 'supabase';
}

/**
 * Check if using Directus provider
 */
export function isDirectus(): boolean {
  return getProviderType() === 'directus';
}

// Re-export types and interfaces
export * from './types';
export * from './interfaces';

// Default export for convenience
export default getBackend;
