/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

// better-auth is ESM-only and not transformed by Jest; better-auth.ts's own
// databaseHooks.create/update.after wiring is exercised through the plain
// createAuthInstance() config object, which doesn't need the real package —
// only syncBetterAuthUser (exported separately, tested directly below) does.
jest.mock('better-auth', () => ({
  betterAuth: jest.fn(() => ({ handler: jest.fn() })),
}));

const mockImportPKCS8 = jest.fn(async () => ({ key: 'apple-private-key' }));
const mockAppleClientSecretSign = jest.fn(async () => 'apple-client-secret');
jest.mock('jose', () => ({
  importPKCS8: mockImportPKCS8,
  SignJWT: jest.fn(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuer: jest.fn().mockReturnThis(),
    setSubject: jest.fn().mockReturnThis(),
    setAudience: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    sign: mockAppleClientSecretSign,
  })),
}));

jest.mock('../../../lib/server/database-pool', () => ({
  getDatabasePool: jest.fn(() => ({})),
  hasDatabaseConnectionString: () => true,
}));

const mockSyncPublicUserRegistry = jest.fn();
const mockEnsureSupabaseAccountForEmail = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn();
const mockGetInfisicalSecret = jest.fn();

jest.mock('../../../lib/auth/public-user-registry', () => ({
  syncPublicUserRegistry: (...args: unknown[]) => mockSyncPublicUserRegistry(...args),
}));

jest.mock('../../../lib/auth/supabase-admin-bridge', () => ({
  ensureSupabaseAccountForEmail: (...args: unknown[]) => mockEnsureSupabaseAccountForEmail(...args),
}));

jest.mock('../../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args),
}));

jest.mock('../../../lib/server/infisical-secrets', () => ({
  getInfisicalSecret: (...args: unknown[]) => mockGetInfisicalSecret(...args),
}));

describe('syncBetterAuthUser (Supabase account bridge)', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSyncPublicUserRegistry.mockReset();
    mockEnsureSupabaseAccountForEmail.mockReset();
    mockGetSupabaseServerForRequest.mockReset();
    mockGetInfisicalSecret.mockReset();
    mockSyncPublicUserRegistry.mockResolvedValue({ id: 'registry-id-123' });
    mockGetSupabaseServerForRequest.mockReturnValue({ auth: { admin: {} } });
  });

  it('issues explicit verified-email claims for MCP domain authorization', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { buildMcpAccessTokenClaims } = require('../../../lib/server/better-auth');

    expect(buildMcpAccessTokenClaims({
      email: 'member@hashpass.tech',
      emailVerified: true,
    })).toEqual({
      'https://hashpass.tech/email': 'member@hashpass.tech',
      'https://hashpass.tech/email_verified': true,
    });
    expect(buildMcpAccessTokenClaims({
      email: 'member@hashpass.app',
      emailVerified: false,
    })['https://hashpass.tech/email_verified']).toBe(false);
    expect(buildMcpAccessTokenClaims(null)).toEqual({
      'https://hashpass.tech/email': '',
      'https://hashpass.tech/email_verified': false,
    });
  });

  it('wires verified-email claims into the MCP OAuth plugin', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { betterAuth } = require('better-auth');
    const { getAuth } = require('../../../lib/server/better-auth');

    getAuth();

    const authConfig = betterAuth.mock.calls[0][0];
    const mcpPlugin = authConfig.plugins.find((plugin: { id?: string }) => plugin.id === 'mcp');
    expect(mcpPlugin.options.customAccessTokenClaims({
      user: { email: 'operator@hashpass.tech', emailVerified: true },
    })).toEqual({
      'https://hashpass.tech/email': 'operator@hashpass.tech',
      'https://hashpass.tech/email_verified': true,
    });
  });

  it('configures Apple for both web Service ID and native bundle audiences', async () => {
    const previous = {
      serviceId: process.env.BETTER_AUTH_APPLE_CLIENT_ID,
      teamId: process.env.BETTER_AUTH_APPLE_TEAM_ID,
      keyId: process.env.BETTER_AUTH_APPLE_KEY_ID,
      privateKey: process.env.BETTER_AUTH_APPLE_PRIVATE_KEY,
    };
    process.env.BETTER_AUTH_APPLE_CLIENT_ID = 'tech.hashpass.signin';
    process.env.BETTER_AUTH_APPLE_TEAM_ID = 'TEAM123456';
    process.env.BETTER_AUTH_APPLE_KEY_ID = 'KEY1234567';
    process.env.BETTER_AUTH_APPLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nkey-data\\n-----END PRIVATE KEY-----';

    try {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { betterAuth } = require('better-auth');
      const { getAuth } = require('../../../lib/server/better-auth');

      getAuth();

      const authConfig = betterAuth.mock.calls[0][0];
      expect(authConfig.trustedOrigins).toContain('https://appleid.apple.com');
      const apple = await authConfig.socialProviders.apple();

      expect(apple.clientId).toEqual(['tech.hashpass.signin', 'tech.hashpass.app']);
      expect(apple.appBundleIdentifier).toBe('tech.hashpass.app');
      expect(apple.clientSecret).toBe('apple-client-secret');
      expect(mockImportPKCS8).toHaveBeenCalledWith(
        '-----BEGIN PRIVATE KEY-----\nkey-data\n-----END PRIVATE KEY-----',
        'ES256',
      );
    } finally {
      if (previous.serviceId === undefined) delete process.env.BETTER_AUTH_APPLE_CLIENT_ID;
      else process.env.BETTER_AUTH_APPLE_CLIENT_ID = previous.serviceId;
      if (previous.teamId === undefined) delete process.env.BETTER_AUTH_APPLE_TEAM_ID;
      else process.env.BETTER_AUTH_APPLE_TEAM_ID = previous.teamId;
      if (previous.keyId === undefined) delete process.env.BETTER_AUTH_APPLE_KEY_ID;
      else process.env.BETTER_AUTH_APPLE_KEY_ID = previous.keyId;
      if (previous.privateKey === undefined) delete process.env.BETTER_AUTH_APPLE_PRIVATE_KEY;
      else process.env.BETTER_AUTH_APPLE_PRIVATE_KEY = previous.privateKey;
    }
  });

  it('loads Sign in with Apple credentials from Infisical when they are not Lambda environment values', async () => {
    const names = [
      'BETTER_AUTH_APPLE_CLIENT_ID',
      'BETTER_AUTH_APPLE_TEAM_ID',
      'BETTER_AUTH_APPLE_KEY_ID',
      'BETTER_AUTH_APPLE_PRIVATE_KEY',
    ] as const;
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    for (const name of names) delete process.env[name];
    mockGetInfisicalSecret.mockImplementation(async (name: string) => ({
      BETTER_AUTH_APPLE_CLIENT_ID: 'tech.hashpass.signin',
      BETTER_AUTH_APPLE_TEAM_ID: 'TEAM123456',
      BETTER_AUTH_APPLE_KEY_ID: 'KEY1234567',
      BETTER_AUTH_APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nkey-data\\n-----END PRIVATE KEY-----',
    })[name]);

    try {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { betterAuth } = require('better-auth');
      const { getAuth } = require('../../../lib/server/better-auth');

      getAuth();
      const authConfig = betterAuth.mock.calls[0][0];
      const apple = await authConfig.socialProviders.apple();

      expect(apple.clientSecret).toBe('apple-client-secret');
      expect(mockGetInfisicalSecret).toHaveBeenCalledWith('BETTER_AUTH_APPLE_PRIVATE_KEY');
    } finally {
      for (const name of names) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
      }
    }
  });

  it('does nothing when context has no real Request', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { syncBetterAuthUser } = require('../../../lib/server/better-auth');

    await syncBetterAuthUser({ id: 'ba-1', email: 'user@example.com' }, {});

    expect(mockSyncPublicUserRegistry).not.toHaveBeenCalled();
    expect(mockEnsureSupabaseAccountForEmail).not.toHaveBeenCalled();
  });

  it('syncs the public user registry and bridges a Supabase account on create', async () => {
    mockEnsureSupabaseAccountForEmail.mockResolvedValue({ id: 'auth-uuid-123' });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { syncBetterAuthUser } = require('../../../lib/server/better-auth');

    const request = new Request('https://bsl.hashpass.tech/api/auth/callback/google');
    const user = { id: 'ba-1', email: 'newuser@example.com', name: 'New User', image: 'https://img/pic.png' };

    await syncBetterAuthUser(user, { request });

    expect(mockSyncPublicUserRegistry).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        provider: 'better-auth',
        authUserId: 'ba-1',
        email: 'newuser@example.com',
        // Locks in the fix for a real gap: resolveSupabaseIdentityForUser
        // (used by admin/event-admin access checks) resolves a Better-Auth
        // caller's supabaseUserId purely from provider_ids.supabase — the
        // bridged Supabase uid must land here, not just in a shadow
        // auth.users row, or admin checks silently keep failing.
        providerIds: { 'better-auth': 'ba-1', supabase: 'auth-uuid-123' },
      })
    );
    expect(mockEnsureSupabaseAccountForEmail).toHaveBeenCalledWith(
      { auth: { admin: {} } },
      expect.objectContaining({
        email: 'newuser@example.com',
        userMetadata: expect.objectContaining({
          auth_provider: 'better-auth',
          auth_bridge: 'better_auth_hook',
          better_auth_user_id: 'ba-1',
        }),
      })
    );
  });

  it('logs and does not throw when the Supabase bridge fails, and omits supabase from providerIds', async () => {
    mockEnsureSupabaseAccountForEmail.mockRejectedValue(new Error('supabase down'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { syncBetterAuthUser } = require('../../../lib/server/better-auth');

    const request = new Request('https://bsl.hashpass.tech/api/auth/callback/google');
    const user = { id: 'ba-2', email: 'flaky@example.com', name: 'Flaky User' };

    await expect(syncBetterAuthUser(user, { request })).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Better Auth] Supabase account bridge failed:',
      'supabase down'
    );
    expect(mockSyncPublicUserRegistry).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ providerIds: { 'better-auth': 'ba-2' } })
    );

    consoleErrorSpy.mockRestore();
  });

  it('omits supabase from providerIds when the bridge resolves without an id', async () => {
    mockEnsureSupabaseAccountForEmail.mockResolvedValue(null);

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { syncBetterAuthUser } = require('../../../lib/server/better-auth');

    const request = new Request('https://bsl.hashpass.tech/api/auth/callback/google');
    const user = { id: 'ba-4', email: 'nobridge@example.com' };

    await syncBetterAuthUser(user, { request });

    expect(mockSyncPublicUserRegistry).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ providerIds: { 'better-auth': 'ba-4' } })
    );
  });

  it('stringifies a non-Error rejection when logging a failed bridge attempt', async () => {
    mockEnsureSupabaseAccountForEmail.mockRejectedValue('plain string failure');
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { syncBetterAuthUser } = require('../../../lib/server/better-auth');

    const request = new Request('https://bsl.hashpass.tech/api/auth/callback/google');
    const user = { id: 'ba-5', email: 'stringerror@example.com' };

    await syncBetterAuthUser(user, { request });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Better Auth] Supabase account bridge failed:',
      'plain string failure'
    );

    consoleErrorSpy.mockRestore();
  });

  it('reads request from context.context.request when context.request is absent', async () => {
    mockEnsureSupabaseAccountForEmail.mockResolvedValue({ id: 'auth-uuid-456' });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { syncBetterAuthUser } = require('../../../lib/server/better-auth');

    const request = new Request('https://bsl.hashpass.tech/api/auth/callback/google');
    const user = { id: 'ba-3', email: 'nested@example.com' };

    await syncBetterAuthUser(user, { context: { request } });

    expect(mockSyncPublicUserRegistry).toHaveBeenCalledWith(request, expect.anything());
    expect(mockEnsureSupabaseAccountForEmail).toHaveBeenCalled();
  });
});
