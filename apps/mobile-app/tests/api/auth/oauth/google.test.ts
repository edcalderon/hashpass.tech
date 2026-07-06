/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('expo-router/server', () => ({
  ExpoResponse: class ExpoResponse extends Response {},
}));

describe('google oauth api', () => {
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
    setEnv('GOOGLE_CLIENT_SECRET', undefined);
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

  it('falls back to localhost in local development when Google OAuth is not configured', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../../app/api/auth/oauth/google+api');

    const response = await GET(
      new Request('http://localhost:8081/api/auth/oauth/google', {
        headers: {
          origin: 'https://hashpass.tech',
          referer: 'https://hashpass.tech/auth',
          cookie: 'oauth_return_to=%7B%22returnTo%22%3A%22%2Fdashboard%2Fexplore%22%7D',
        },
      })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'http://localhost:8081/dashboard/explore?error=oauth_failed&message=Google+OAuth+client+credentials+are+not+configured.'
    );
  });
});
