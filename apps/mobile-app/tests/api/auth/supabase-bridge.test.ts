/// <reference types="jest" />

const mockAuthenticateRequest = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn();
const mockEnsureSupabaseAccountForEmail = jest.fn();
const mockIssueSupabaseSessionBridge = jest.fn();
const mockSyncPublicUserRegistry = jest.fn();

jest.mock('@hashpass/auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args),
}));

jest.mock('@/lib/auth/supabase-admin-bridge', () => ({
  ensureSupabaseAccountForEmail: (...args: unknown[]) => mockEnsureSupabaseAccountForEmail(...args),
  issueSupabaseSessionBridge: (...args: unknown[]) => mockIssueSupabaseSessionBridge(...args),
}));

jest.mock('@/lib/auth/public-user-registry', () => ({
  syncPublicUserRegistry: (...args: unknown[]) => mockSyncPublicUserRegistry(...args),
}));

describe('/api/auth/supabase-bridge', () => {
  beforeEach(() => {
    jest.resetModules();
    mockAuthenticateRequest.mockReset();
    mockGetSupabaseServerForRequest.mockReset();
    mockEnsureSupabaseAccountForEmail.mockReset();
    mockIssueSupabaseSessionBridge.mockReset();
    mockSyncPublicUserRegistry.mockReset();
    mockGetSupabaseServerForRequest.mockReturnValue({ auth: { admin: {} } });
  });

  it('returns 401 when there is no valid Better Auth session', async () => {
    mockAuthenticateRequest.mockResolvedValue({ user: null, error: 'No Better Auth session cookie provided' });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../../app/api/auth/supabase-bridge+api');
    const response = await POST(
      new Request('https://api.hashpass.tech/api/auth/supabase-bridge', { method: 'POST' })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'No Better Auth session cookie provided' });
    expect(mockEnsureSupabaseAccountForEmail).not.toHaveBeenCalled();
  });

  it('returns 401 when the authenticated user has no email', async () => {
    mockAuthenticateRequest.mockResolvedValue({ user: { id: 'ba-1', email: '' }, error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../../app/api/auth/supabase-bridge+api');
    const response = await POST(
      new Request('https://api.hashpass.tech/api/auth/supabase-bridge', { method: 'POST' })
    );

    expect(response.status).toBe(401);
  });

  it('ensures the Supabase account exists and returns a session bridge', async () => {
    mockAuthenticateRequest.mockResolvedValue({
      user: { id: 'ba-1', email: 'user@example.com', first_name: 'User', last_name: 'Example' },
      error: null,
    });
    mockEnsureSupabaseAccountForEmail.mockResolvedValue({ id: 'auth-uuid-123' });
    mockIssueSupabaseSessionBridge.mockResolvedValue({
      token_hash: 'hash-123',
      type: 'magiclink',
      email: 'user@example.com',
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
    expect(mockIssueSupabaseSessionBridge).toHaveBeenCalledWith({ auth: { admin: {} } }, 'user@example.com');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      token_hash: 'hash-123',
      type: 'magiclink',
      email: 'user@example.com',
    });
  });

  it('returns 500 when the bridge cannot be issued', async () => {
    mockAuthenticateRequest.mockResolvedValue({
      user: { id: 'ba-1', email: 'user@example.com' },
      error: null,
    });
    mockEnsureSupabaseAccountForEmail.mockResolvedValue(null);
    mockIssueSupabaseSessionBridge.mockResolvedValue(null);

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../../app/api/auth/supabase-bridge+api');
    const response = await POST(
      new Request('https://api.hashpass.tech/api/auth/supabase-bridge', { method: 'POST' })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to issue Supabase session bridge' });
  });

  it('returns 500 when an unexpected error is thrown', async () => {
    mockAuthenticateRequest.mockResolvedValue({
      user: { id: 'ba-1', email: 'user@example.com' },
      error: null,
    });
    mockEnsureSupabaseAccountForEmail.mockRejectedValue(new Error('boom'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../../app/api/auth/supabase-bridge+api');
    const response = await POST(
      new Request('https://api.hashpass.tech/api/auth/supabase-bridge', { method: 'POST' })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to issue Supabase session bridge' });
    errorSpy.mockRestore();
  });
});
