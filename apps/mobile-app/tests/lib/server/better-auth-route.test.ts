/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

const mockBetterAuthHandler = jest.fn();

jest.mock('../../../lib/server/better-auth', () => ({
  getAuthHandler: () => mockBetterAuthHandler,
}));

describe('better-auth-route', () => {
  beforeEach(() => {
    jest.resetModules();
    mockBetterAuthHandler.mockReset();
  });

  it('rewrites Better Auth error redirects to the frontend auth page', async () => {
    mockBetterAuthHandler.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://api.hashpass.tech/api/auth/error?error=state_mismatch',
        },
      })
    );

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../lib/server/better-auth-route');
    const response = await GET(
      new Request('https://api.hashpass.tech/api/auth/callback/google?state=bad')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://hashpass.tech/auth?error=state_mismatch&message=Google+sign-in+expired+or+could+not+be+verified.+Please+try+again.'
    );
  });

  it('short-circuits direct Better Auth error pages before calling the auth handler', async () => {
    const { GET } = require('../../../lib/server/better-auth-route');
    const response = await GET(
      new Request('https://api.hashpass.tech/api/auth/error?error=state_mismatch')
    );

    expect(mockBetterAuthHandler).not.toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://hashpass.tech/auth?error=state_mismatch&message=Sign-in+expired+or+could+not+be+verified.+Please+try+again.'
    );
  });

  it('rewrites RFC 8414 issuer-path discovery to the Better Auth base path', async () => {
    mockBetterAuthHandler.mockResolvedValueOnce(Response.json({ issuer: 'https://api.hashpass.tech/api/auth' }));
    const { GET } = require('../../../app/.well-known/oauth-authorization-server/api/auth+api');

    const response = await GET(
      new Request('https://api.hashpass.tech/.well-known/oauth-authorization-server/api/auth?client=chatgpt')
    );

    expect(response.status).toBe(200);
    const forwarded = mockBetterAuthHandler.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe(
      'https://api.hashpass.tech/api/auth/.well-known/oauth-authorization-server?client=chatgpt'
    );
  });
});
