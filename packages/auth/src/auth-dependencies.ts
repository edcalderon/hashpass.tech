import type { SupabaseClient } from '@supabase/supabase-js';

let injectedSupabaseClient: SupabaseClient | undefined;
const configureListeners = new Set<() => void>();

/**
 * Register host-app auth dependencies without importing the full provider
 * factory. This keeps apps that only need configuration from pulling optional
 * provider clients into their module graph.
 */
export function configureAuthService(dependencies: { supabaseClient?: SupabaseClient }): void {
  injectedSupabaseClient = dependencies.supabaseClient;
  configureListeners.forEach((listener) => listener());
}

export function getInjectedSupabaseClient(): SupabaseClient | undefined {
  return injectedSupabaseClient;
}

export function onAuthServiceConfigured(listener: () => void): () => void {
  configureListeners.add(listener);
  return () => {
    configureListeners.delete(listener);
  };
}
