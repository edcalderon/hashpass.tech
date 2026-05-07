/**
 * Configuration types and schemas
 * @whitelabel/auth
 */

import { z } from 'zod';
import type { StorageAdapter } from './auth.js';

export const SupabaseConfigSchema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(1),
  serviceRoleKey: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

export const DirectusConfigSchema = z.object({
  url: z.string().url(),
  staticToken: z.string().optional(),
  oauth: z.object({
    providers: z.array(z.enum(['google', 'github', 'facebook', 'twitter', 'apple'])),
    redirectUrl: z.string().url(),
    proxyConfig: z.object({
      enabled: z.boolean(),
      apiBaseUrl: z.string().url(),
    }).optional(),
  }),
});

export const SyncConfigSchema = z.object({
  enabled: z.boolean().default(true),
  strategy: z.enum(['realtime', 'polling', 'webhook']).default('webhook'),
  pollingInterval: z.number().min(1000).default(30000),
  conflictResolution: z.enum(['supabase-wins', 'directus-wins', 'timestamp']).default('supabase-wins'),
});

export const WalletConfigSchema = z.object({
  ethereum: z.object({
    enabled: z.boolean().default(false),
    chainId: z.number().default(1),
    rpcUrl: z.string().url().optional(),
  }).optional(),
  solana: z.object({
    enabled: z.boolean().default(false),
    network: z.enum(['mainnet-beta', 'testnet', 'devnet']).default('mainnet-beta'),
    rpcUrl: z.string().url().optional(),
  }).optional(),
});

export const StorageConfigSchema = z.object({
  type: z.enum(['localStorage', 'secureStore', 'asyncStorage', 'custom']),
  customProvider: z.custom<StorageAdapter>().optional(),
});

export const AuthConfigSchema = z.object({
  // Primary: Supabase configuration
  supabase: SupabaseConfigSchema,
  
  // Secondary: Directus configuration
  directus: DirectusConfigSchema,
  
  // Sync configuration
  sync: SyncConfigSchema.default({}),
  
  // Wallet authentication
  wallet: WalletConfigSchema.optional(),
  
  // Storage configuration
  storage: StorageConfigSchema,
  
  // Application configuration
  app: z.object({
    name: z.string().min(1),
    url: z.string().url(),
    logoUrl: z.string().url().optional(),
  }).optional(),
  
  // Security configuration
  security: z.object({
    requireEmailVerification: z.boolean().default(true),
    allowMultipleWallets: z.boolean().default(true),
    maxSessionsPerUser: z.number().int().min(1).default(5),
    sessionRefreshInterval: z.number().min(60000).default(300000), // 5 minutes
  }).default({}),
});

export type SupabaseConfig = z.infer<typeof SupabaseConfigSchema>;
export type DirectusConfig = z.infer<typeof DirectusConfigSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type WalletConfig = z.infer<typeof WalletConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export function validateConfig(config: unknown): AuthConfig {
  return AuthConfigSchema.parse(config);
}
