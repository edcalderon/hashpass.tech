/**
 * Backend Provider Factory
 * Use registerSupabaseClients(supabaseClient, serviceRoleClient?) from the app before getBackend().
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BackendProvider } from './types';
import type { IBackendProvider } from './interfaces';
import { SupabaseBackendProvider } from './supabase';

let supabaseClient: SupabaseClient | null = null;
let supabaseServiceRoleClient: SupabaseClient | null = null;
let supabaseProvider: IBackendProvider | null = null;
let directusProvider: IBackendProvider | null = null;
let currentProvider: IBackendProvider | null = null;

/**
 * Register Supabase client(s). Call this from the app before using getBackend().
 */
export function registerSupabaseClients(
  client: SupabaseClient,
  serviceRoleClient?: SupabaseClient | null
): void {
  supabaseClient = client;
  supabaseServiceRoleClient = serviceRoleClient ?? null;
  supabaseProvider = new SupabaseBackendProvider(client, serviceRoleClient ?? undefined);
}

export function getProviderType(): BackendProvider {
  const provider = process.env.EXPO_PUBLIC_BACKEND_PROVIDER as BackendProvider;
  return provider === 'directus' ? 'directus' : 'supabase';
}

async function getSupabaseProvider(): Promise<IBackendProvider> {
  if (supabaseProvider) return supabaseProvider;
  if (supabaseClient) {
    supabaseProvider = new SupabaseBackendProvider(
      supabaseClient,
      supabaseServiceRoleClient ?? undefined
    );
    return supabaseProvider;
  }
  throw new Error(
    'Supabase client not set. Call registerSupabaseClients(supabaseClient) from the app before using getBackend().'
  );
}

async function getDirectusProvider(): Promise<IBackendProvider> {
  if (directusProvider) return directusProvider;
  const { DirectusBackendProvider } = await import('./directus');
  const baseUrl = process.env.EXPO_PUBLIC_DIRECTUS_URL;
  const staticToken = process.env.EXPO_PUBLIC_DIRECTUS_TOKEN;
  if (!baseUrl) throw new Error('EXPO_PUBLIC_DIRECTUS_URL is required for Directus provider');
  directusProvider = new DirectusBackendProvider({ baseUrl, staticToken });
  await directusProvider.initialize();
  return directusProvider;
}

export async function getBackendAsync(): Promise<IBackendProvider> {
  if (currentProvider) return currentProvider;
  const providerType = getProviderType();
  if (providerType === 'directus') {
    currentProvider = await getDirectusProvider();
  } else {
    currentProvider = await getSupabaseProvider();
  }
  return currentProvider;
}

export function getBackend(): IBackendProvider {
  if (currentProvider) return currentProvider;
  const providerType = getProviderType();
  if (providerType === 'directus') {
    console.warn('getBackend() called but Directus requires async initialization. Use getBackendAsync() instead.');
  }
  if (supabaseProvider) {
    currentProvider = supabaseProvider;
    return currentProvider;
  }
  if (supabaseClient) {
    supabaseProvider = new SupabaseBackendProvider(
      supabaseClient,
      supabaseServiceRoleClient ?? undefined
    );
    currentProvider = supabaseProvider;
    return currentProvider;
  }
  throw new Error(
    'Supabase client not set. Call registerSupabaseClients(supabaseClient) from the app before using getBackend().'
  );
}

export function resetProvider(): void {
  currentProvider = null;
  supabaseProvider = null;
  directusProvider = null;
}

export function isSupabase(): boolean {
  return getProviderType() === 'supabase';
}

export function isDirectus(): boolean {
  return getProviderType() === 'directus';
}

export * from './types';
export * from './interfaces';
export default getBackend;
export { SupabaseBackendProvider } from './supabase';
