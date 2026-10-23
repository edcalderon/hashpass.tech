/// <reference types="jest" />

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('../../../../packages/auth/src/factory', () => ({
  createAuthProviderFromEnv: jest.fn(),
  resolveAuthProviderConfig: jest.fn(() => ({
    provider: 'better-auth',
    betterAuth: { basePath: '/api/auth' },
  })),
}));
jest.mock('../../../../packages/auth/src/auth-dependencies', () => ({
  getInjectedSupabaseClient: jest.fn(),
  onAuthServiceConfigured: jest.fn(),
}));
jest.mock('../../../../packages/auth/src/providers/directus-api-client', () => ({
  DirectusApiClient: jest.fn(),
}));

describe('Better Auth server request origin', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
  });

  it('keeps local session verification on the Expo HTTP origin', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      Response.json({
        user: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
      }),
    ) as typeof fetch;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { authenticateRequest } = require('../../../../packages/auth/src/auth-service');
    const request = new Request('http://localhost:8081/api/notifications', {
      headers: {
        cookie: 'better-auth.session_token=test-session',
      },
    });

    await expect(authenticateRequest(request)).resolves.toMatchObject({
      user: { id: 'user-1', email: 'user@example.com' },
      error: null,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8081/api/auth/get-session',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
