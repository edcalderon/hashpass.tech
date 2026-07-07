/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('expo-router/server', () => ({
  ExpoResponse: class ExpoResponse extends Response {},
}));

describe('oauth callback api', () => {
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
    setEnv('EXPO_PUBLIC_ENV', 'production');
    setEnv('EXPO_PUBLIC_FRONTEND_URL', undefined);
    setEnv('FRONTEND_URL', undefined);
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

  it('redirects oauth failures away from api.hashpass.tech', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../../app/api/auth/oauth/callback+api');

    const response = await GET(
      new Request('https://api.hashpass.tech/api/auth/oauth/callback?error=access_denied&message=broken', {
        headers: {
          origin: 'https://api.hashpass.tech',
          referer: 'https://api.hashpass.tech/auth',
        },
      })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://hashpass.tech/auth?error=oauth_failed&message=Authentication+could+not+be+completed.+broken+Redirecting+to+login.'
    );
  });

  it('returns native OAuth callbacks to the app scheme when native_callback is present', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../../app/api/auth/oauth/callback+api');

    const response = await GET(
      new Request(
        'https://api.hashpass.tech/api/auth/oauth/callback?access_token=access123&refresh_token=refresh456',
        {
          headers: {
            cookie: 'oauth_native_callback=hashpass%3A%2F%2Fauth%2Fcallback; oauth_return_to=%7B%22returnTo%22%3A%22%2Fdashboard%2Fexplore%22%7D',
            origin: 'https://api.hashpass.tech',
            referer: 'https://api.hashpass.tech/auth',
          },
        }
      )
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'hashpass://auth/callback?returnTo=%2Fdashboard%2Fexplore&access_token=access123&refresh_token=refresh456'
    );
  });
});
