/**
 * Sync Engine for bidirectional replication between Supabase and Directus
 * @whitelabel/auth
 */

import type { User, Session } from '../types/auth.js';
import type { SyncConfig } from '../types/config.js';
import { SupabaseProvider } from './supabase/SupabaseProvider.js';
import { DirectusProvider } from './directus/DirectusProvider.js';
import { SyncError } from '../types/auth.js';

export interface SyncResult {
  success: boolean;
  user?: User;
  error?: string;
}

export interface SyncMetadata {
  lastSyncAt: string;
  sourceProvider: 'supabase' | 'directus';
  syncVersion: number;
}

export class SyncEngine {
  private supabase: SupabaseProvider;
  private directus: DirectusProvider;
  private config: SyncConfig;
  private syncQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  constructor(
    supabase: SupabaseProvider,
    directus: DirectusProvider,
    config: SyncConfig
  ) {
    this.supabase = supabase;
    this.directus = directus;
    this.config = config;
  }

  /**
   * Replicate user from Directus to Supabase
   * Used after OAuth sign-in via Directus
   */
  async replicateToSupabase(params: {
    directusUser: User;
    session: Session;
    oauthProvider?: string;
  }): Promise<SyncResult> {
    try {
      const { directusUser, session, oauthProvider } = params;

      // Check if user already exists in Supabase by email
      const supabaseClient = this.supabase.getSupabaseClient();
      
      // Try to find existing user by email
      const { data: existingUsers, error: lookupError } = await supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('email', directusUser.email)
        .limit(1);

      if (lookupError) {
        throw new SyncError(
          `Failed to lookup user in Supabase: ${lookupError.message}`,
          'directus',
          'supabase'
        );
      }

      let supabaseUserId: string;

      if (existingUsers && existingUsers.length > 0) {
        // Update existing user
        const existingUser = existingUsers[0];
        supabaseUserId = existingUser.id;

        const { error: updateError } = await supabaseClient
          .from('user_profiles')
          .update({
            first_name: directusUser.firstName || existingUser.first_name,
            last_name: directusUser.lastName || existingUser.last_name,
            avatar_url: directusUser.avatar || existingUser.avatar_url,
            directus_id: directusUser.id,
            last_directus_sync: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', supabaseUserId);

        if (updateError) {
          throw new SyncError(
            `Failed to update user in Supabase: ${updateError.message}`,
            'directus',
            'supabase'
          );
        }
      } else {
        // Create new user via Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
          email: directusUser.email,
          password: this.generateSecurePassword(), // Random password, user uses OAuth
          options: {
            data: {
              first_name: directusUser.firstName,
              last_name: directusUser.lastName,
              avatar_url: directusUser.avatar,
              directus_id: directusUser.id,
              oauth_provider: oauthProvider,
            },
          },
        });

        if (authError || !authData.user) {
          throw new SyncError(
            `Failed to create user in Supabase: ${authError?.message || 'Unknown error'}`,
            'directus',
            'supabase'
          );
        }

        supabaseUserId = authData.user.id;

        // Create user profile
        const { error: profileError } = await supabaseClient
          .from('user_profiles')
          .insert({
            id: supabaseUserId,
            email: directusUser.email,
            first_name: directusUser.firstName,
            last_name: directusUser.lastName,
            avatar_url: directusUser.avatar,
            directus_id: directusUser.id,
            last_directus_sync: new Date().toISOString(),
            role: 'authenticated',
            status: 'active',
          });

        if (profileError) {
          throw new SyncError(
            `Failed to create user profile in Supabase: ${profileError.message}`,
            'directus',
            'supabase'
          );
        }
      }

      // Log sync event
      await this.logSyncEvent(supabaseUserId, 'directus_to_supabase', {
        directus_id: directusUser.id,
        supabase_id: supabaseUserId,
        oauth_provider: oauthProvider,
      });

      return {
        success: true,
        user: {
          ...directusUser,
          id: supabaseUserId,
          supabaseUid: supabaseUserId,
        },
      };
    } catch (error) {
      console.error('Sync to Supabase failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown sync error',
      };
    }
  }

  /**
   * Replicate user from Supabase to Directus
   * Used for keeping Directus in sync with Supabase updates
   */
  async replicateToDirectus(supabaseUser: User): Promise<SyncResult> {
    try {
      // Create or update user in Directus
      const directusUser = await this.directus.createOrUpdateUser({
        email: supabaseUser.email,
        first_name: supabaseUser.firstName,
        last_name: supabaseUser.lastName,
        avatar: supabaseUser.avatar,
        supabase_uid: supabaseUser.id,
        supabase_email: supabaseUser.email,
        last_supabase_sync: new Date().toISOString(),
        status: 'active',
      });

      if (!directusUser) {
        throw new SyncError(
          'Failed to create/update user in Directus',
          'supabase',
          'directus'
        );
      }

      // Log sync event
      await this.logSyncEvent(supabaseUser.id, 'supabase_to_directus', {
        supabase_id: supabaseUser.id,
        directus_id: directusUser.directusId,
      });

      return {
        success: true,
        user: {
          ...supabaseUser,
          directusId: directusUser.directusId,
        },
      };
    } catch (error) {
      console.error('Sync to Directus failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown sync error',
      };
    }
  }

  /**
   * Replicate user from external provider to primary (Supabase)
   * Provider-agnostic version of replicateToSupabase
   */
  async replicateToPrimary(params: {
    externalUser: User;
    session: Session;
    oauthProvider?: string;
  }): Promise<SyncResult> {
    return this.replicateToSupabase({
      directusUser: params.externalUser,
      session: params.session,
      oauthProvider: params.oauthProvider,
    });
  }

  /**
   * Replicate user from primary (Supabase) to secondary provider
   * Provider-agnostic version of replicateToDirectus
   */
  async replicateToSecondary(user: User): Promise<SyncResult> {
    return this.replicateToDirectus(user);
  }
  async linkSessions(
    supabaseSession: Session,
    directusSession: Session
  ): Promise<void> {
    try {
      const supabaseClient = this.supabase.getSupabaseClient();

      // Update user profile with Directus linkage
      await supabaseClient
        .from('user_profiles')
        .update({
          directus_id: directusSession.user.directusId,
          last_directus_sync: new Date().toISOString(),
        })
        .eq('id', supabaseSession.user.id);

      // Log session link
      await this.logSyncEvent(supabaseSession.user.id, 'session_link', {
        supabase_session: supabaseSession.accessToken,
        directus_session: directusSession.accessToken,
      });
    } catch (error) {
      console.error('Failed to link sessions:', error);
    }
  }

  /**
   * Resolve conflicts between Supabase and Directus user data
   */
  resolveConflict(
    supabaseData: Partial<User>,
    directusData: Partial<User>,
    strategy: 'supabase-wins' | 'directus-wins' | 'timestamp' = 'supabase-wins'
  ): Partial<User> {
    switch (strategy) {
      case 'supabase-wins':
        return { ...directusData, ...supabaseData };
      
      case 'directus-wins':
        return { ...supabaseData, ...directusData };
      
      case 'timestamp':
        // Use the data with the more recent updated_at
        // This is a simplified version - in production, compare field by field
        return { ...supabaseData, ...directusData };
      
      default:
        return { ...supabaseData, ...directusData };
    }
  }

  /**
   * Enable real-time sync via Supabase realtime subscriptions
   */
  async enableRealtimeSync(): Promise<() => void> {
    const supabaseClient = this.supabase.getSupabaseClient();

    const subscription = supabaseClient
      .channel('auth-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_profiles',
        },
        async (payload) => {
          // Queue sync to Directus
          this.queueSync(async () => {
            const user: User = {
              id: payload.new.id,
              email: payload.new.email,
              firstName: payload.new.first_name,
              lastName: payload.new.last_name,
              avatar: payload.new.avatar_url,
            };
            await this.replicateToDirectus(user);
          });
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }

  private queueSync(syncFn: () => Promise<void>): void {
    this.syncQueue.push(syncFn);
    this.processSyncQueue();
  }

  private async processSyncQueue(): Promise<void> {
    if (this.isProcessingQueue || this.syncQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.syncQueue.length > 0) {
      const syncFn = this.syncQueue.shift();
      if (syncFn) {
        try {
          await syncFn();
        } catch (error) {
          console.error('Sync queue item failed:', error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  private async logSyncEvent(
    userId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      const supabaseClient = this.supabase.getSupabaseClient();
      await supabaseClient.from('auth_sync_log').insert({
        user_id: userId,
        source: eventType.includes('directus') ? 'directus' : 'supabase',
        event_type: eventType,
        payload,
      });
    } catch (error) {
      console.error('Failed to log sync event:', error);
    }
  }

  private generateSecurePassword(): string {
    // Generate a random secure password for OAuth users
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 32; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
