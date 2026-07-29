/// <reference types="jest" />

const mockGetBetterAuthSessionUser = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn();
const mockEnsureSupabaseAccountForEmail = jest.fn();
const mockCreateSupabaseBridgeSession = jest.fn();
const mockSyncPublicUserRegistry = jest.fn();

jest.mock('@/lib/server/better-auth', () => ({
  getBetterAuthSessionUser: (...args: unknown[]) => mockGetBetterAuthSessionUser(...args),
}));

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args),
}));

jest.mock('@/lib/auth/supabase-admin-bridge', () => ({
  ensureSupabaseAccountForEmail: (...args: unknown[]) => mockEnsureSupabaseAccountForEmail(...args),
  createSupabaseBridgeSession: (...args: unknown[]) => mockCreateSupabaseBridgeSession(...args),
}));

jest.mock('@/lib/auth/public-user-registry', () => ({
  syncPublicUserRegistry: (...args: unknown[]) => mockSyncPublicUserRegistry(...args),
}));

describe('/api/auth/supabase-bridge', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetBetterAuthSessionUser.mockReset();
    mockGetSupabaseServerForRequest.mockReset();
    mockEnsureSupabaseAccountForEmail.mockReset();
    mockCreateSupabaseBridgeSession.mockReset();
    mockSyncPublicUserRegistry.mockReset();
    mockGetSupabaseServerForRequest.mockReturnValue({ auth: { admin: {} } });
  });

  it('returns 401 when there is no valid Better Auth session', async () => {
    mockGetBetterAuthSessionUser.mockResolvedValue(null);

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../../app/api/auth/supabase-bridge+api');
    const response = await POST(
      new Request('https://api.hashpass.tech/api/auth/supabase-bridge', { method: 'POST' })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'No Better Auth session found' });
    expect(mockEnsureSupabaseAccountForEmail).not.toHaveBeenCalled();
  });

  it('returns 401 when the authenticated user has no email', async () => {
    mockGetBetterAuthSessionUser.mockResolvedValue({ id: 'ba-1', email: '' });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../../app/api/auth/supabase-bridge+api');
    const response = await POST(
      new Request('https://api.hashpass.tech/api/auth/supabase-bridge', { method: 'POST' })
    );

    expect(response.status).toBe(401);
  });

  it('ensures the Supabase account exists and returns a completed session bridge', async () => {
    mockGetBetterAuthSessionUser.mockResolvedValue({
      id: 'ba-1',
      email: 'user@example.com',
      first_name: 'User',
      last_name: 'Example',
    });
    mockEnsureSupabaseAccountForEmail.mockResolvedValue({ id: 'auth-uuid-123' });
    mockCreateSupabaseBridgeSession.mockResolvedValue({
      access_token: 'supabase-access-token',
      refresh_token: 'supabase-refresh-token',
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../../app/api/auth/supabase-bridge+api');
    const response = await POST(
      new Request('https://api.hashpass.tech/api/auth/supabase-bridge', { method: 'POST' })
    );

    expect(mockEnsureSupabaseAccountForEmail).toHaveBeenCalledWith(
      { auth: { admin: {} } },
      expect.objectContaining({ email: 'user@example.com' })
    );
    expect(mockSyncPublicUserRegistry).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        providerIds: { 'better-auth': 'ba-1', supabase: 'auth-uuid-123' },
      })
    );
    expect(mockCreateSupabaseBridgeSession).toHaveBeenCalledWith({ auth: { admin: {} } }, 'user@example.com');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      session: {
        access_token: 'supabase-access-token',
        refresh_token: 'supabase-refresh-token',
      },
    });
  });

  it('returns 500 when the bridge session cannot be established', async () => {
    mockGetBetterAuthSessionUser.mockResolvedValue({ id: 'ba-1', email: 'user@example.com' });
    mockEnsureSupabaseAccountForEmail.mockResolvedValue(null);
    mockCreateSupabaseBridgeSession.mockResolvedValue(null);

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../../app/api/auth/supabase-bridge+api');
    const response = await POST(
      new Request('https://api.hashpass.tech/api/auth/supabase-bridge', { method: 'POST' })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to establish Supabase session bridge' });
  });

  it('returns 500 when an unexpected error is thrown', async () => {
    mockGetBetterAuthSessionUser.mockResolvedValue({ id: 'ba-1', email: 'user@example.com' });
    mockEnsureSupabaseAccountForEmail.mockRejectedValue(new Error('boom'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../../app/api/auth/supabase-bridge+api');
    const response = await POST(
      new Request('https://api.hashpass.tech/api/auth/supabase-bridge', { method: 'POST' })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to establish Supabase session bridge' });
    errorSpy.mockRestore();
  });
});
