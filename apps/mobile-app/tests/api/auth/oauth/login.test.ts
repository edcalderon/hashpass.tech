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

  const getRedirectTarget = (location: string): URL => {
    const directusUrl = new URL(location);
    const redirect = directusUrl.searchParams.get('redirect');

    if (!redirect) {
      throw new Error('Missing redirect query parameter');
    }

    return new URL(redirect);
  };

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

  it('routes Google sign-in through Directus without a Google-specific bootstrap', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../../app/api/auth/oauth/login+api');

    const response = await GET(
      new Request(
        'http://localhost:8081/api/auth/oauth/login?provider=google&returnTo=%2Fdashboard%2Fexplore&native_callback=hashpass%3A%2F%2Fauth%2Fcallback',
        {
        headers: {
          origin: 'https://hashpass.tech',
          referer: 'https://hashpass.tech/auth',
        },
      }
      )
    );

    expect(response.status).toBe(302);
    const location = response.headers.get('location') || '';
    const redirectUrl = getRedirectTarget(location);
    expect(location).toContain('https://sso.hashpass.co/auth/login/google?');
    expect(location).not.toContain('client_id=');
    expect(redirectUrl.searchParams.get('returnTo')).toBe('/dashboard/explore');
    expect(redirectUrl.searchParams.get('native_callback')).toBe('hashpass://auth/callback');
  });

  it('falls back to the default dashboard route when returnTo is relative', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../../app/api/auth/oauth/login+api');

    const response = await GET(
      new Request('http://localhost:8081/api/auth/oauth/login?provider=google&returnTo=dashboard', {
        headers: {
          origin: 'https://hashpass.tech',
          referer: 'https://hashpass.tech/auth',
        },
      })
    );

    expect(response.status).toBe(302);
    const location = response.headers.get('location') || '';
    const redirectUrl = getRedirectTarget(location);
    expect(redirectUrl.searchParams.get('returnTo')).toBe('/dashboard/explore');
  });

  it('falls back to the default dashboard route for auth paths', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../../app/api/auth/oauth/login+api');

    const response = await GET(
      new Request('http://localhost:8081/api/auth/oauth/login?provider=google&returnTo=%2Fauth%2Fcallback', {
        headers: {
          origin: 'https://hashpass.tech',
          referer: 'https://hashpass.tech/auth',
        },
      })
    );

    expect(response.status).toBe(302);
    const location = response.headers.get('location') || '';
    const redirectUrl = getRedirectTarget(location);
    expect(redirectUrl.searchParams.get('returnTo')).toBe('/dashboard/explore');
  });

  it('derives the real frontend origin when the request lands on api.hashpass.tech', async () => {
    setEnv('EXPO_PUBLIC_ENV', 'production');

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../../../app/api/auth/oauth/login+api');

    const response = await GET(
      new Request('https://api.hashpass.tech/api/auth/oauth/login?provider=bogus', {
        headers: {
          origin: 'https://api.hashpass.tech',
          referer: 'https://api.hashpass.tech/auth',
        },
      })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://hashpass.tech/auth?error=invalid_provider&message=Provider+%27bogus%27+is+not+supported'
    );
  });
});
