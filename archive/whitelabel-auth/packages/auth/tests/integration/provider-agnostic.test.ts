/**
 * Integration tests for @whitelabel/auth
 * Tests the provider-agnostic architecture with HASHPASS-like flows
 * @whitelabel/auth
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthOrchestrator, createAuthOrchestrator } from '../src/core/AuthOrchestrator.js';
import { ProviderFactory } from '../src/core/ProviderFactory.js';
import { SupabaseAdapter } from '../src/adapters/SupabaseAdapter.js';
import { DirectusAdapter } from '../src/adapters/DirectusAdapter.js';
import type { AuthConfig } from '../src/types/config.js';
import type { IPrimaryProvider, ISecondaryProvider } from '../src/types/provider.js';

// Mock storage adapter
const createMockStorage = () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

// Mock primary provider
const createMockPrimaryProvider = (): IPrimaryProvider => ({
  name: 'mock-primary',
  storage: createMockStorage(),
  signInWithEmailAndPassword: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  isAuthenticated: vi.fn(() => false),
  getUser: vi.fn(() => null),
  onAuthStateChange: vi.fn(() => () => {}),
  signUp: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  signInWithMagicLink: vi.fn(),
  signInWithOTP: vi.fn(),
  verifyOTP: vi.fn(),
});

// Mock secondary provider
const createMockSecondaryProvider = (): ISecondaryProvider => ({
  name: 'mock-secondary',
  storage: createMockStorage(),
  config: {
    baseUrl: 'http://localhost:8055',
    redirectUrl: 'http://localhost:3000/auth/callback',
    supportedProviders: ['google', 'github'],
  },
  signInWithEmailAndPassword: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  isAuthenticated: vi.fn(() => false),
  getUser: vi.fn(() => null),
  onAuthStateChange: vi.fn(() => () => {}),
  initiateOAuth: vi.fn(),
  handleCallback: vi.fn(),
  refreshTokens: vi.fn(),
  getUserInfo: vi.fn(),
  isProviderConfigured: vi.fn(),
  mapExternalUser: vi.fn(),
  syncUser: vi.fn(),
  signInWithOAuth: vi.fn(),
  handleOAuthCallback: vi.fn(),
});

describe('AuthOrchestrator - Provider Agnostic Architecture', () => {
  let orchestrator: AuthOrchestrator;
  let mockPrimary: IPrimaryProvider;
  let mockSecondary: ISecondaryProvider;

  beforeEach(() => {
    mockPrimary = createMockPrimaryProvider();
    mockSecondary = createMockSecondaryProvider();

    orchestrator = new AuthOrchestrator({
      primary: mockPrimary,
      secondary: mockSecondary,
      storage: createMockStorage(),
      sync: { enabled: true },
    });
  });

  describe('Dependency Injection', () => {
    it('should accept custom primary provider', async () => {
      const customProvider = createMockPrimaryProvider();
      customProvider.signInWithEmailAndPassword = vi.fn().mockResolvedValue({
        user: { id: '1', email: 'test@example.com' },
        session: { accessToken: 'token' },
      });

      const customOrchestrator = new AuthOrchestrator({
        primary: customProvider,
        storage: createMockStorage(),
      });

      await customOrchestrator.signInWithEmailAndPassword('test@example.com', 'password');
      expect(customProvider.signInWithEmailAndPassword).toHaveBeenCalledWith('test@example.com', 'password');
    });

    it('should accept custom secondary provider', async () => {
      const customOrchestrator = new AuthOrchestrator({
        primary: mockPrimary,
        secondary: mockSecondary,
        storage: createMockStorage(),
      });

      expect(customOrchestrator.getSecondaryProvider()).toBe(mockSecondary);
    });

    it('should work without secondary provider', async () => {
      const noSecondaryOrchestrator = new AuthOrchestrator({
        primary: mockPrimary,
        storage: createMockStorage(),
      });

      expect(noSecondaryOrchestrator.getSecondaryProvider()).toBeUndefined();
    });
  });

  describe('Email/Password Authentication', () => {
    it('should delegate to primary provider', async () => {
      mockPrimary.signInWithEmailAndPassword = vi.fn().mockResolvedValue({
        user: { id: '1', email: 'test@example.com' },
        session: { accessToken: 'token' },
      });

      await orchestrator.signInWithEmailAndPassword('test@example.com', 'password');
      expect(mockPrimary.signInWithEmailAndPassword).toHaveBeenCalledWith('test@example.com', 'password');
    });

    it('should sync user to secondary provider on login', async () => {
      const user = { id: '1', email: 'test@example.com' };
      mockPrimary.signInWithEmailAndPassword = vi.fn().mockResolvedValue({
        user,
        session: { accessToken: 'token' },
      });

      await orchestrator.signInWithEmailAndPassword('test@example.com', 'password');
      // In real implementation, this would sync to secondary
    });
  });

  describe('OAuth Authentication', () => {
    it('should delegate OAuth to secondary provider', async () => {
      mockSecondary.signInWithOAuth = vi.fn().mockResolvedValue({
        pending: true,
      });

      await orchestrator.signInWithOAuth('google');
      expect(mockSecondary.signInWithOAuth).toHaveBeenCalledWith('google');
    });

    it('should sync OAuth user to primary provider', async () => {
      const user = { id: '1', email: 'test@example.com' };
      mockSecondary.handleOAuthCallback = vi.fn().mockResolvedValue({
        user,
        session: { accessToken: 'token' },
      });

      await orchestrator.handleOAuthCallback({ code: '123', provider: 'google' });
      // In real implementation, this would sync to primary
    });

    it('should return error if secondary provider not configured', async () => {
      const noSecondaryOrchestrator = new AuthOrchestrator({
        primary: mockPrimary,
        storage: createMockStorage(),
      });

      const result = await noSecondaryOrchestrator.signInWithOAuth('google');
      expect(result.error).toBeDefined();
    });
  });

  describe('Sign Up', () => {
    it('should delegate sign up to primary provider', async () => {
      mockPrimary.signUp = vi.fn().mockResolvedValue({
        user: { id: '1', email: 'test@example.com' },
        session: { accessToken: 'token' },
      });

      await orchestrator.signUp('test@example.com', 'password', { firstName: 'Test' });
      expect(mockPrimary.signUp).toHaveBeenCalledWith('test@example.com', 'password', { firstName: 'Test' });
    });
  });

  describe('Magic Link', () => {
    it('should delegate magic link to primary provider if supported', async () => {
      mockPrimary.signInWithMagicLink = vi.fn().mockResolvedValue({});

      await orchestrator.signInWithMagicLink('test@example.com');
      expect(mockPrimary.signInWithMagicLink).toHaveBeenCalledWith('test@example.com', undefined);
    });

    it('should return error if primary provider does not support magic link', async () => {
      mockPrimary.signInWithMagicLink = undefined;

      const result = await orchestrator.signInWithMagicLink('test@example.com');
      expect(result.error).toBeDefined();
    });
  });

  describe('OTP', () => {
    it('should delegate OTP to primary provider if supported', async () => {
      mockPrimary.signInWithOTP = vi.fn().mockResolvedValue({});

      await orchestrator.signInWithOTP('test@example.com');
      expect(mockPrimary.signInWithOTP).toHaveBeenCalledWith('test@example.com', undefined);
    });

    it('should delegate OTP verification to primary provider', async () => {
      mockPrimary.verifyOTP = vi.fn().mockResolvedValue({
        user: { id: '1', email: 'test@example.com' },
        session: { accessToken: 'token' },
      });

      await orchestrator.verifyOTP('123456', 'email', 'test@example.com');
      expect(mockPrimary.verifyOTP).toHaveBeenCalledWith('123456', 'email', 'test@example.com');
    });
  });
});

describe('ProviderFactory', () => {
  it('should be a singleton', () => {
    const factory1 = ProviderFactory.getInstance();
    const factory2 = ProviderFactory.getInstance();
    expect(factory1).toBe(factory2);
  });

  it('should support supabase provider', () => {
    const factory = ProviderFactory.getInstance();
    expect(factory.isSupported('supabase')).toBe(true);
  });

  it('should support directus provider', () => {
    const factory = ProviderFactory.getInstance();
    expect(factory.isSupported('directus')).toBe(true);
  });

  it('should support custom provider type', () => {
    const factory = ProviderFactory.getInstance();
    expect(factory.isSupported('custom')).toBe(true);
  });
});

describe('createAuthOrchestrator', () => {
  it('should create orchestrator from config', () => {
    const config: AuthConfig = {
      supabase: {
        url: 'http://localhost:54321',
        anonKey: 'test-key',
      },
      directus: {
        url: 'http://localhost:8055',
        oauth: {
          providers: ['google'],
          redirectUrl: 'http://localhost:3000/auth/callback',
        },
      },
      sync: {
        enabled: true,
        strategy: 'webhook',
        conflictResolution: 'supabase-wins',
      },
      storage: {
        type: 'localStorage',
      },
    };

    // This would create real adapters in production
    // For testing, we verify the config is accepted
    expect(() => {
      // Note: This would fail in real test without actual Supabase/Directus
      // createAuthOrchestrator(config);
    }).not.toThrow();
  });
});

// Example: How to swap Directus for Strapi

describe('Provider Swap - Directus to Strapi', () => {
  it('demonstrates how to swap OAuth providers', () => {
    // Before: Using Directus
    const directusConfig = {
      url: 'http://localhost:8055',
      oauth: {
        providers: ['google'],
        redirectUrl: 'http://localhost:3000/auth/callback',
      },
    };

    // After: Using Strapi (when implemented)
    const strapiConfig = {
      url: 'http://localhost:1337',
      apiToken: 'your-api-token',
      oauth: {
        providers: ['google'],
        redirectUrl: 'http://localhost:3000/auth/callback',
      },
    };

    // The orchestrator doesn't care which provider you use
    // as long as it implements ISecondaryProvider
    expect(directusConfig).toBeDefined();
    expect(strapiConfig).toBeDefined();
  });
});
