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

const mockSyncPublicUserRegistry = jest.fn();
const mockEnsureSupabaseAccountForEmail = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn();

jest.mock('../../../lib/auth/public-user-registry', () => ({
  syncPublicUserRegistry: (...args: unknown[]) => mockSyncPublicUserRegistry(...args),
}));

jest.mock('../../../lib/auth/supabase-admin-bridge', () => ({
  ensureSupabaseAccountForEmail: (...args: unknown[]) => mockEnsureSupabaseAccountForEmail(...args),
}));

jest.mock('../../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args),
}));

describe('syncBetterAuthUser (Supabase account bridge)', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSyncPublicUserRegistry.mockReset();
    mockEnsureSupabaseAccountForEmail.mockReset();
    mockGetSupabaseServerForRequest.mockReset();
    mockSyncPublicUserRegistry.mockResolvedValue({ id: 'registry-id-123' });
    mockGetSupabaseServerForRequest.mockReturnValue({ auth: { admin: {} } });
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
