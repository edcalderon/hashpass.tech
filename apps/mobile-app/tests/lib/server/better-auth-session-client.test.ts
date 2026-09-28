/// <reference types="jest" />

describe('getBetterAuthSessionUser HTTP client', () => {
  const originalFetch = global.fetch;
  const originalServerAuthURL = process.env.BETTER_AUTH_URL;
  const originalPublicAuthURL = process.env.EXPO_PUBLIC_BETTER_AUTH_URL;

  beforeEach(() => {
    delete process.env.BETTER_AUTH_URL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalPublicAuthURL === undefined) {
      delete process.env.EXPO_PUBLIC_BETTER_AUTH_URL;
    } else {
      process.env.EXPO_PUBLIC_BETTER_AUTH_URL = originalPublicAuthURL;
    }
    if (originalServerAuthURL === undefined) {
      delete process.env.BETTER_AUTH_URL;
    } else {
      process.env.BETTER_AUTH_URL = originalServerAuthURL;
    }
    jest.resetModules();
  });

  it('forwards only the session cookie to the configured auth endpoint', async () => {
    process.env.EXPO_PUBLIC_BETTER_AUTH_URL = 'https://api.hashpass.tech/api/auth';
    global.fetch = jest.fn().mockResolvedValue(
      Response.json({
        user: {
          id: 'user-1',
          email: 'admin@hashpass.tech',
          name: 'Hashpass Admin',
        },
      }),
    ) as typeof fetch;

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getBetterAuthSessionUser } = require('../../../lib/server/better-auth-session-client');
    await expect(
      getBetterAuthSessionUser(
        new Request('https://api.hashpass.tech/api/admin/access', {
          headers: { cookie: 'better-auth.session_token=secret' },
        }),
      ),
    ).resolves.toMatchObject({
      id: 'user-1',
      email: 'admin@hashpass.tech',
      first_name: 'Hashpass',
      last_name: 'Admin',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      new URL('https://api.hashpass.tech/api/auth/get-session'),
      expect.objectContaining({
        method: 'GET',
        headers: {
          Cookie: 'better-auth.session_token=secret',
          Accept: 'application/json',
        },
        redirect: 'error',
      }),
    );
  });

  it('does not fetch when no session cookie is present', async () => {
    global.fetch = jest.fn() as typeof fetch;
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getBetterAuthSessionUser } = require('../../../lib/server/better-auth-session-client');

    await expect(
      getBetterAuthSessionUser(new Request('https://api.hashpass.tech/api/admin/access')),
    ).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects an untrusted request origin when no auth URL is configured', async () => {
    delete process.env.EXPO_PUBLIC_BETTER_AUTH_URL;
    global.fetch = jest.fn() as typeof fetch;
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getBetterAuthSessionUser } = require('../../../lib/server/better-auth-session-client');

    await expect(
      getBetterAuthSessionUser(
        new Request('https://attacker.example/api/admin/access', {
          headers: { cookie: 'better-auth.session_token=secret' },
        }),
      ),
    ).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects plaintext HTTP for a production auth host', async () => {
    process.env.EXPO_PUBLIC_BETTER_AUTH_URL = 'http://api.hashpass.tech/api/auth';
    global.fetch = jest.fn() as typeof fetch;
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getBetterAuthSessionUser } = require('../../../lib/server/better-auth-session-client');

    await expect(
      getBetterAuthSessionUser(
        new Request('https://api.hashpass.tech/api/admin/access', {
          headers: { cookie: 'better-auth.session_token=secret' },
        }),
      ),
    ).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
