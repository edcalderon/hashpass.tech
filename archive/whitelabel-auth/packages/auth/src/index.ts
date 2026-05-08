/**
 * Main entry point for @whitelabel/auth
 */

export * from './types/index.js';
export * from './core/AuthManager.js';
export * from './core/AuthOrchestrator.js';
export * from './core/SyncEngine.js';
export * from './core/ProviderFactory.js';
export * from './providers/base/BaseAuthProvider.js';
export * from './providers/supabase/SupabaseProvider.js';
export * from './providers/directus/DirectusProvider.js';
export * from './utils/storage.js';
export { AuthManager as default } from './core/AuthManager.js';
export { AuthOrchestrator, createAuthOrchestrator } from './core/AuthOrchestrator.js';
