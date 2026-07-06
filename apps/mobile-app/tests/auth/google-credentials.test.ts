/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

describe('google credentials resolver', () => {
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
    setEnv('GOOGLE_CLIENT_ID', undefined);
    setEnv('GOOGLE_CLIENT_SECRET', undefined);
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_ID', undefined);
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_SECRET', undefined);
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', undefined);
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

  it('prefers the Better Auth client id alias when the legacy env is absent', async () => {
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_ID', 'alias-client-id');

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { resolveGoogleOAuthClientId } = require('../../lib/auth/oauth/google-credentials');

    expect(resolveGoogleOAuthClientId()).toBe('alias-client-id');
  });

  it('prefers the Better Auth secret alias when the legacy env is absent', async () => {
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_SECRET', 'alias-client-secret');

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { resolveGoogleOAuthClientSecret } = require('../../lib/auth/oauth/google-credentials');

    expect(resolveGoogleOAuthClientSecret()).toBe('alias-client-secret');
  });
});
