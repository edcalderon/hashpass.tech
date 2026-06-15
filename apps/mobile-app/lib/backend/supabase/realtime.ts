/**
 * Supabase Realtime Provider Implementation
 * 
 * Wraps the existing Supabase realtime functionality behind the IRealtimeProvider interface.
 */

import type { SupabaseClient, RealtimeChannel as SupabaseRealtimeChannel } from '@supabase/supabase-js';
import type { RealtimeChannel, RealtimeFilter } from '../types';
import type { IRealtimeProvider } from '../interfaces';

// Wrapper class for Supabase RealtimeChannel
class SupabaseRealtimeChannelWrapper implements RealtimeChannel {
  private channel: SupabaseRealtimeChannel;
  
  constructor(channel: SupabaseRealtimeChannel) {
    this.channel = channel;
  }
  
  subscribe(callback?: (status: string) => void): RealtimeChannel {
    this.channel.subscribe((status) => {
      if (callback) {
        callback(status);
      }
    });
    return this;
  }
  
  unsubscribe(): void {
    this.channel.unsubscribe();
  }
  
  on(
    event: 'postgres_changes' | 'broadcast' | 'presence',
    filter: RealtimeFilter | { event: string },
    callback: (payload: any) => void
  ): RealtimeChannel {
    if (event === 'postgres_changes') {
      const pgFilter = filter as RealtimeFilter;
      (this.channel as any).on('postgres_changes', {
        event: pgFilter.event,
        schema: pgFilter.schema || 'public',
        table: pgFilter.table,
        filter: pgFilter.filter,
      }, callback);
    } else if (event === 'broadcast') {
      const broadcastFilter = filter as { event: string };
      (this.channel as any).on('broadcast', { event: broadcastFilter.event }, callback);
    } else if (event === 'presence') {
      const presenceFilter = filter as { event: string };
      (this.channel as any).on('presence', { event: presenceFilter.event }, callback);
    }
    
    return this;
  }
  
  async send(payload: { type: string; event: string; payload: any }): Promise<void> {
    await this.channel.send({
      type: payload.type as 'broadcast' | 'presence' | 'postgres_changes',
      event: payload.event,
      payload: payload.payload,
    });
  }
}

export class SupabaseRealtimeProvider implements IRealtimeProvider {
  private client: SupabaseClient;
  private channels: Map<string, SupabaseRealtimeChannelWrapper> = new Map();
  
  constructor(client: SupabaseClient) {
    this.client = client;
  }
  
  channel(name: string, options?: { config?: Record<string, any> }): RealtimeChannel {
    const supabaseChannel = this.client.channel(name, options as any);
    const wrapper = new SupabaseRealtimeChannelWrapper(supabaseChannel);
    this.channels.set(name, wrapper);
    return wrapper;
  }
  
  async removeChannel(channel: RealtimeChannel): Promise<void> {
    channel.unsubscribe();
    
    // Find and remove from our map
    for (const [name, ch] of this.channels.entries()) {
      if (ch === channel) {
        this.channels.delete(name);
        break;
      }
    }
  }
  
  async removeAllChannels(): Promise<void> {
    for (const channel of this.channels.values()) {
      channel.unsubscribe();
    }
    this.channels.clear();
    
    // Also use Supabase's removeAllChannels
    await this.client.removeAllChannels();
  }
  
  getChannels(): RealtimeChannel[] {
    return Array.from(this.channels.values());
  }
  
  isConnected(): boolean {
    // Supabase doesn't expose a direct way to check connection status
    // We'll assume connected if there are active channels
    return this.channels.size > 0;
  }
  
  connect(): void {
    // Supabase auto-connects when subscribing to channels
    // This is a no-op for Supabase
  }
  
  disconnect(): void {
    this.removeAllChannels();
  }
}
