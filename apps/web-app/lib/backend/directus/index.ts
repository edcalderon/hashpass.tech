/**
 * Directus Backend Provider
 * 
 * Combined provider that wraps all Directus functionality behind the IBackendProvider interface.
 * This is the alternative provider for migration to self-hosted infrastructure.
 */

import type { IBackendProvider, IAuthProvider, IDatabaseProvider, IRealtimeProvider, IStorageProvider } from '../interfaces';
import { DirectusAuthProvider } from './auth';
import { DirectusDatabaseProvider } from './database';
import { DirectusRealtimeProvider } from './realtime';
import { DirectusStorageProvider } from './storage';

export interface DirectusConfig {
  baseUrl: string;
  staticToken?: string;
}

export class DirectusBackendProvider implements IBackendProvider {
  readonly providerType = 'directus' as const;
  
  private config: DirectusConfig;
  private _auth: IAuthProvider;
  private _db: IDatabaseProvider;
  private _realtime: IRealtimeProvider;
  private _storage: IStorageProvider;
  
  constructor(config: DirectusConfig) {
    this.config = config;
    
    this._auth = new DirectusAuthProvider({
      baseUrl: config.baseUrl,
      staticToken: config.staticToken,
    });
    
    this._db = new DirectusDatabaseProvider({
      baseUrl: config.baseUrl,
      staticToken: config.staticToken,
    });
    
    this._realtime = new DirectusRealtimeProvider({
      baseUrl: config.baseUrl,
      staticToken: config.staticToken,
    });
    
    this._storage = new DirectusStorageProvider({
      baseUrl: config.baseUrl,
      staticToken: config.staticToken,
    });
  }
  
  get auth(): IAuthProvider {
    return this._auth;
  }
  
  get db(): IDatabaseProvider {
    return this._db;
  }
  
  get realtime(): IRealtimeProvider {
    return this._realtime;
  }
  
  get storage(): IStorageProvider {
    return this._storage;
  }
  
  async initialize(): Promise<void> {
    // Check if Directus is reachable
    try {
      const response = await fetch(`${this.config.baseUrl}/server/health`);
      if (!response.ok) {
        throw new Error(`Directus health check failed: ${response.status}`);
      }
    } catch (error) {
      console.warn('Directus initialization warning:', error);
      // Don't throw - allow offline initialization
    }
  }
  
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/server/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
  
  getClient(): null {
    // Directus provider uses fetch directly, no client object
    return null;
  }
}

// Re-export individual providers
export { DirectusAuthProvider } from './auth';
export { DirectusDatabaseProvider } from './database';
export { DirectusRealtimeProvider } from './realtime';
export { DirectusStorageProvider } from './storage';
