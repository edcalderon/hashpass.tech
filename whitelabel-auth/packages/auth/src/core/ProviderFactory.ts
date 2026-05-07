/**
 * Provider Factory for creating authentication providers
 * Implements dependency injection pattern for provider-agnostic architecture
 * @whitelabel/auth
 */

import type { StorageAdapter } from '../types/auth.js';
import type { IAuthProvider, IPrimaryProvider, ISecondaryProvider, IProviderFactory } from '../types/provider.js';
import { SupabaseAdapter } from '../adapters/SupabaseAdapter.js';
import { DirectusAdapter } from '../adapters/DirectusAdapter.js';
import type { SupabaseConfig, DirectusConfig } from '../types/config.js';

/**
 * Provider configuration discriminator
 */
export type ProviderConfig = 
  | { type: 'supabase'; config: SupabaseConfig }
  | { type: 'directus'; config: DirectusConfig }
  | { type: 'strapi'; config: { url: string; apiToken?: string } }
  | { type: 'custom'; provider: IAuthProvider };

/**
 * Provider Factory implementation
 * Creates provider instances based on configuration type
 */
export class ProviderFactory {
  private static instance: ProviderFactory;
  private factories: Map<string, IProviderFactory> = new Map();

  private constructor() {}

  static getInstance(): ProviderFactory {
    if (!ProviderFactory.instance) {
      ProviderFactory.instance = new ProviderFactory();
    }
    return ProviderFactory.instance;
  }

  /**
   * Register a custom provider factory
   */
  register(factory: IProviderFactory): void {
    // Use the factory name or generate one
    const name = factory.constructor.name;
    this.factories.set(name, factory);
  }

  /**
   * Create a provider instance from configuration
   */
  createProvider(config: ProviderConfig, storage: StorageAdapter): IAuthProvider {
    switch (config.type) {
      case 'supabase':
        return this.createSupabaseProvider(config.config, storage);
      
      case 'directus':
        return this.createDirectusProvider(config.config, storage);
      
      case 'strapi':
        return this.createStrapiProvider(config.config, storage);
      
      case 'custom':
        return config.provider;
      
      default:
        throw new Error(`Unknown provider type: ${(config as any).type}`);
    }
  }

  /**
   * Create Supabase primary provider
   */
  private createSupabaseProvider(config: SupabaseConfig, storage: StorageAdapter): IPrimaryProvider {
    return new SupabaseAdapter(config, storage);
  }

  /**
   * Create Directus OAuth provider
   */
  private createDirectusProvider(config: DirectusConfig, storage: StorageAdapter): ISecondaryProvider {
    return new DirectusAdapter(config, storage);
  }

  /**
   * Create Strapi OAuth provider (stub for future implementation)
   */
  private createStrapiProvider(
    _config: { url: string; apiToken?: string }, 
    _storage: StorageAdapter
  ): ISecondaryProvider {
    throw new Error(
      'Strapi provider not yet implemented. ' +
      'To use Strapi, implement the ISecondaryProvider interface ' +
      'and register it via ProviderFactory.register()'
    );
  }

  /**
   * Check if provider type is supported
   */
  isSupported(type: string): boolean {
    return ['supabase', 'directus', 'strapi', 'custom'].includes(type);
  }

  /**
   * Get all registered custom factories
   */
  getRegisteredFactories(): IProviderFactory[] {
    return Array.from(this.factories.values());
  }
}

/**
 * Convenience function to create provider
 */
export function createProvider(
  config: ProviderConfig, 
  storage: StorageAdapter
): IAuthProvider {
  return ProviderFactory.getInstance().createProvider(config, storage);
}

/**
 * Create primary provider (Supabase)
 */
export function createPrimaryProvider(
  config: SupabaseConfig,
  storage: StorageAdapter
): IPrimaryProvider {
  return new SupabaseAdapter(config, storage);
}

/**
 * Create secondary/OAuth provider (Directus, Strapi, etc.)
 */
export function createSecondaryProvider(
  type: 'directus' | 'strapi',
  config: DirectusConfig | { url: string; apiToken?: string },
  storage: StorageAdapter
): ISecondaryProvider {
  switch (type) {
    case 'directus':
      return new DirectusAdapter(config as DirectusConfig, storage);
    case 'strapi':
      throw new Error('Strapi provider not yet implemented');
    default:
      throw new Error(`Unknown secondary provider type: ${type}`);
  }
}

// Export factory instance
export const providerFactory = ProviderFactory.getInstance();
