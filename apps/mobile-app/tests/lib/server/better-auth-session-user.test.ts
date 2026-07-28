/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

const mockHandler = jest.fn();

// getBetterAuthSessionUser calls getAuthHandler() in-process — it never
// makes a real network request, so mocking better-auth's own handler here
// is enough to exercise the full function without a live Better Auth server.
jest.mock('better-auth', () => ({
  betterAuth: jest.fn(() => ({ handler: mockHandler })),
}));

// getAuth() returns null (falling back to a 503 stub handler) unless a DB
// connection string is configured — force the real mocked handler above to
// be used regardless of test-environment env vars.
jest.mock('../../../lib/server/database-pool', () => ({
  ...jest.requireActual('../../../lib/server/database-pool'),
  hasDatabaseConnectionString: () => true,
}));

describe('getBetterAuthSessionUser', () => {
  beforeEach(() => {
    jest.resetModules();
    mockHandler.mockReset();
  });

  it('returns null when the request has no cookie header', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getBetterAuthSessionUser } = require('../../../lib/server/better-auth');

    const request = new Request('https://api.hashpass.tech/api/auth/supabase-bridge', { method: 'POST' });
    const user = await getBetterAuthSessionUser(request);

    expect(user).toBeNull();
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('calls get-session in-process (not gated by tenant hostname) and returns the mapped user', async () => {
    mockHandler.mockResolvedValue(
      Response.json({
        user: { id: 'ba-1', email: 'core-user@hashpass.tech', name: 'Core User', role: 'user' },
      })
    );

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getBetterAuthSessionUser } = require('../../../lib/server/better-auth');

    // Origin is the core tenant, whose SSO_CONFIG authProvider is still the
    // stale 'directus' value — this must NOT affect the result, since this
    // function never routes by tenant.
    const request = new Request('https://api.hashpass.tech/api/auth/supabase-bridge', {
      method: 'POST',
      headers: { Cookie: 'better-auth.session_token=abc123', Origin: 'https://hashpass.tech' },
    });

    const user = await getBetterAuthSessionUser(request);

    expect(user).toEqual(
      expect.objectContaining({ id: 'ba-1', email: 'core-user@hashpass.tech', first_name: 'Core', role: 'user' })
    );
    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    expect(calledRequest.url).toBe('https://api.hashpass.tech/api/auth/get-session');
    expect(calledRequest.headers.get('cookie')).toBe('better-auth.session_token=abc123');
  });

  it('returns null when get-session responds with a non-ok status', async () => {
    mockHandler.mockResolvedValue(new Response(null, { status: 401 }));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getBetterAuthSessionUser } = require('../../../lib/server/better-auth');

    const request = new Request('https://api.hashpass.tech/api/auth/supabase-bridge', {
      method: 'POST',
      headers: { Cookie: 'better-auth.session_token=expired' },
    });

    const user = await getBetterAuthSessionUser(request);
    expect(user).toBeNull();
  });

  it('returns null when get-session responds with no user', async () => {
    mockHandler.mockResolvedValue(Response.json({ user: null }));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getBetterAuthSessionUser } = require('../../../lib/server/better-auth');

    const request = new Request('https://api.hashpass.tech/api/auth/supabase-bridge', {
      method: 'POST',
      headers: { Cookie: 'better-auth.session_token=abc123' },
    });

    const user = await getBetterAuthSessionUser(request);
    expect(user).toBeNull();
  });

  it('returns null and logs when the handler throws unexpectedly', async () => {
    mockHandler.mockRejectedValue(new Error('handler exploded'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getBetterAuthSessionUser } = require('../../../lib/server/better-auth');

    const request = new Request('https://api.hashpass.tech/api/auth/supabase-bridge', {
      method: 'POST',
      headers: { Cookie: 'better-auth.session_token=abc123' },
    });

    const user = await getBetterAuthSessionUser(request);

    expect(user).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      '[Better Auth] Direct session verification failed:',
      'handler exploded'
    );
    errorSpy.mockRestore();
  });
});
