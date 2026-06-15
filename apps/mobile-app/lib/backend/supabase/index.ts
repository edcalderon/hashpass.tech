/**
 * Supabase Backend Provider
 * 
 * Combined provider that wraps all Supabase functionality behind the IBackendProvider interface.
 * This is the default provider and maintains full backward compatibility with the existing codebase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IBackendProvider, IAuthProvider, IDatabaseProvider, IRealtimeProvider, IStorageProvider } from '../interfaces';
import { SupabaseAuthProvider } from './auth';
import { SupabaseDatabaseProvider } from './database';
import { SupabaseRealtimeProvider } from './realtime';
import { SupabaseStorageProvider } from './storage';

export class SupabaseBackendProvider implements IBackendProvider {
  readonly providerType = 'supabase' as const;
  
  private client: SupabaseClient;
  private serviceRoleClient?: SupabaseClient;
  
  private _auth: IAuthProvider;
  private _db: IDatabaseProvider;
  private _realtime: IRealtimeProvider;
  private _storage: IStorageProvider;
  
  constructor(client: SupabaseClient, serviceRoleClient?: SupabaseClient) {
    this.client = client;
    this.serviceRoleClient = serviceRoleClient;
    
    this._auth = new SupabaseAuthProvider(client, serviceRoleClient);
    this._db = new SupabaseDatabaseProvider(client);
    this._realtime = new SupabaseRealtimeProvider(client);
    this._storage = new SupabaseStorageProvider(client);
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
    // Supabase is initialized during client creation
    // No additional initialization needed
  }
  
  async isHealthy(): Promise<boolean> {
    try {
      // Simple health check - try to get the current user (will work even if not authenticated)
      const { error } = await this.client.auth.getSession();
      return !error;
    } catch {
      return false;
    }
  }
  
  getClient(): SupabaseClient {
    return this.client;
  }
}

// Re-export individual providers for granular usage
export { SupabaseAuthProvider } from './auth';
export { SupabaseDatabaseProvider } from './database';
export { SupabaseRealtimeProvider } from './realtime';
export { SupabaseStorageProvider } from './storage';
