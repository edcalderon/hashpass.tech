/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('expo-router/server', () => ({
  ExpoResponse: class ExpoResponse extends Response {},
}));

describe('oauth login api', () => {
  const envBackup: Record<string, string | undefined> = {};

  const setEnv = (name: string, value?: string) => {
    if (!(name in envBackup)) {
      envBackup[name] = process.env[name];
    }

    if (typeof value === 'string') {
      process.env[name] = value;
    } else {
      delete process.env[name];
    }
  };

  beforeEach(() => {
    jest.resetModules();
    setEnv('EXPO_PUBLIC_ENV', 'local');
    setEnv('EXPO_PUBLIC_FRONTEND_URL', undefined);
    setEnv('FRONTEND_URL', undefined);
    setEnv('GOOGLE_CLIENT_ID', undefined);
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_ID', undefined);
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(envBackup)) {
      if (typeof value === 'string') {
        process.env[name] = value;
      } else {
        delete process.env[name];
      }
    }
  });

  it('falls back to localhost in local development even when the browser origin is production', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../../app/api/auth/oauth/login+api');

    const response = await GET(
      new Request('http://localhost:8081/api/auth/oauth/login?provider=bogus', {
        headers: {
          origin: 'https://hashpass.tech',
          referer: 'https://hashpass.tech/auth',
        },
      })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'http://localhost:8081/auth?error=invalid_provider&message=Provider+%27bogus%27+is+not+supported'
    );
  });

  it('uses the Better Auth Google client id alias when the legacy env is missing', async () => {
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_ID', 'alias-google-client-id');

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../../app/api/auth/oauth/login+api');

    const response = await GET(
      new Request('http://localhost:8081/api/auth/oauth/login?provider=google&returnTo=%2Fdashboard%2Fexplore', {
        headers: {
          origin: 'https://hashpass.tech',
          referer: 'https://hashpass.tech/auth',
        },
      })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('client_id=alias-google-client-id');
    expect(response.headers.get('location')).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8081%2Fapi%2Fauth%2Foauth%2Fgoogle');
  });
});
