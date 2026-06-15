/**
 * Directus Realtime Provider Implementation
 * 
 * Directus supports WebSocket connections for real-time updates.
 * This implementation uses Directus WebSocket subscriptions.
 * 
 * Key differences from Supabase:
 * - Uses WebSocket with custom message format
 * - Subscriptions work per collection
 * - No built-in broadcast/presence like Supabase
 */

import type { RealtimeChannel, RealtimeFilter, RealtimeEvent } from '../types';
import type { IRealtimeProvider } from '../interfaces';

interface DirectusRealtimeConfig {
  baseUrl: string;
  accessToken?: string;
  staticToken?: string;
}

class DirectusRealtimeChannel implements RealtimeChannel {
  private config: DirectusRealtimeConfig;
  private channelName: string;
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, {
    filter: RealtimeFilter | { event: string };
    callback: (payload: any) => void;
  }> = new Map();
  private isSubscribed: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  
  constructor(config: DirectusRealtimeConfig, channelName: string) {
    this.config = config;
    this.channelName = channelName;
  }
  
  subscribe(callback?: (status: string) => void): RealtimeChannel {
    if (this.isSubscribed) {
      callback?.('SUBSCRIBED');
      return this;
    }
    
    try {
      // Convert HTTP URL to WebSocket URL
      const wsUrl = this.config.baseUrl.replace('http', 'ws') + '/websocket';
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log(`[Directus Realtime] Connected to ${this.channelName}`);
        this.reconnectAttempts = 0;
        
        // Authenticate
        const token = this.config.accessToken || this.config.staticToken;
        if (token) {
          this.ws?.send(JSON.stringify({
            type: 'auth',
            access_token: token,
          }));
        }
        
        // Subscribe to collections based on registered subscriptions
        for (const [id, sub] of this.subscriptions) {
          if ('table' in sub.filter) {
            this.sendSubscribe(sub.filter as RealtimeFilter);
          }
        }
        
        this.isSubscribed = true;
        callback?.('SUBSCRIBED');
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('[Directus Realtime] Failed to parse message:', e);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('[Directus Realtime] WebSocket error:', error);
        callback?.('CHANNEL_ERROR');
      };
      
      this.ws.onclose = () => {
        console.log('[Directus Realtime] WebSocket closed');
        this.isSubscribed = false;
        callback?.('CLOSED');
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => {
            console.log(`[Directus Realtime] Reconnecting (attempt ${this.reconnectAttempts})...`);
            this.subscribe(callback);
          }, this.reconnectDelay * this.reconnectAttempts);
        }
      };
    } catch (error) {
      console.error('[Directus Realtime] Failed to connect:', error);
      callback?.('CHANNEL_ERROR');
    }
    
    return this;
  }
  
  private sendSubscribe(filter: RealtimeFilter): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Subscribe to collection changes
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        collection: filter.table,
        query: filter.filter ? { filter: JSON.parse(filter.filter) } : undefined,
      }));
    }
  }
  
  private handleMessage(data: any): void {
    if (data.type === 'auth' && data.status === 'ok') {
      console.log('[Directus Realtime] Authenticated');
      return;
    }
    
    if (data.type === 'subscription') {
      // Map Directus event types to our types
      const eventType: RealtimeEvent = data.event === 'create' ? 'INSERT'
        : data.event === 'update' ? 'UPDATE'
        : data.event === 'delete' ? 'DELETE'
        : '*';
      
      // Find matching subscriptions
      for (const [id, sub] of this.subscriptions) {
        if ('table' in sub.filter) {
          const filter = sub.filter as RealtimeFilter;
          if (filter.table === data.collection) {
            if (filter.event === '*' || filter.event === eventType) {
              sub.callback({
                eventType,
                new: data.data || {},
                old: data.old_data || {},
                errors: [],
                commitTimestamp: new Date().toISOString(),
              });
            }
          }
        }
      }
      return;
    }
    
    // Handle broadcast messages (custom implementation)
    if (data.type === 'broadcast') {
      for (const [id, sub] of this.subscriptions) {
        if ('event' in sub.filter && !('table' in sub.filter)) {
          const broadcastFilter = sub.filter as { event: string };
          if (broadcastFilter.event === data.event) {
            sub.callback(data.payload);
          }
        }
      }
    }
  }
  
  unsubscribe(): void {
    if (this.ws) {
      // Unsubscribe from all collections
      for (const [id, sub] of this.subscriptions) {
        if ('table' in sub.filter && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'unsubscribe',
            collection: (sub.filter as RealtimeFilter).table,
          }));
        }
      }
      
      this.ws.close();
      this.ws = null;
    }
    
    this.subscriptions.clear();
    this.isSubscribed = false;
  }
  
  on(
    event: 'postgres_changes' | 'broadcast' | 'presence',
    filter: RealtimeFilter | { event: string },
    callback: (payload: any) => void
  ): RealtimeChannel {
    const id = `${event}_${Date.now()}_${Math.random()}`;
    this.subscriptions.set(id, { filter, callback });
    
    // If already connected, subscribe immediately
    if (this.isSubscribed && 'table' in filter) {
      this.sendSubscribe(filter as RealtimeFilter);
    }
    
    return this;
  }
  
  async send(payload: { type: string; event: string; payload: any }): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // For broadcast, we send a custom message format
      // This requires a Directus Flow or custom endpoint to relay
      this.ws.send(JSON.stringify({
        type: 'broadcast',
        channel: this.channelName,
        event: payload.event,
        payload: payload.payload,
      }));
    }
  }
}

export class DirectusRealtimeProvider implements IRealtimeProvider {
  private config: DirectusRealtimeConfig;
  private channels: Map<string, DirectusRealtimeChannel> = new Map();
  private connected: boolean = false;
  
  constructor(config: DirectusRealtimeConfig) {
    this.config = config;
  }
  
  channel(name: string, options?: { config?: Record<string, any> }): RealtimeChannel {
    if (this.channels.has(name)) {
      return this.channels.get(name)!;
    }
    
    const channel = new DirectusRealtimeChannel(this.config, name);
    this.channels.set(name, channel);
    return channel;
  }
  
  async removeChannel(channel: RealtimeChannel): Promise<void> {
    channel.unsubscribe();
    
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
    this.connected = false;
  }
  
  getChannels(): RealtimeChannel[] {
    return Array.from(this.channels.values());
  }
  
  isConnected(): boolean {
    return this.connected || this.channels.size > 0;
  }
  
  connect(): void {
    // Channels connect individually
    this.connected = true;
  }
  
  disconnect(): void {
    this.removeAllChannels();
    this.connected = false;
  }
}
