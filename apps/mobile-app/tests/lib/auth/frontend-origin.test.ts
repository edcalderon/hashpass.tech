describe('frontend origin resolution', () => {
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

  afterAll(() => {
    for (const [name, value] of Object.entries(envBackup)) {
      if (typeof value === 'string') {
        process.env[name] = value;
      } else {
        delete process.env[name];
      }
    }
  });

  it('derives the public frontend from api.hashpass.tech request urls', async () => {
    setEnv('EXPO_PUBLIC_ENV', 'production');

    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      deriveFrontendOriginFromRequest,
      isApiHostname,
      isTrustedFrontendOrigin,
      resolveFrontendOrigin,
    } = require('../../../lib/auth/oauth/frontend-origin');

    expect(isApiHostname('api.hashpass.tech')).toBe(true);
    expect(isApiHostname('api-dev.hashpass.tech')).toBe(true);
    expect(isApiHostname('hashpass.tech')).toBe(false);
    expect(isTrustedFrontendOrigin('https://api.hashpass.tech')).toBe(false);
    expect(deriveFrontendOriginFromRequest(
      new Request('https://api.hashpass.tech/api/auth/oauth/login')
    )).toBe('https://hashpass.tech');
    expect(deriveFrontendOriginFromRequest(
      new Request('https://api-dev.hashpass.tech/api/auth/oauth/login')
    )).toBe('https://dev.hashpass.tech');

    expect(
      resolveFrontendOrigin({
        request: new Request('https://api.hashpass.tech/api/auth/oauth/login'),
        candidates: ['https://api.hashpass.tech'],
        fallbackOrigin: 'https://api.hashpass.tech',
      })
    ).toBe('https://hashpass.tech');
  });

  it('leaves non-api frontends untouched', async () => {
    setEnv('EXPO_PUBLIC_ENV', 'production');

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { deriveFrontendOriginFromRequest, resolveFrontendOrigin } = require(
      '../../../lib/auth/oauth/frontend-origin'
    );

    expect(deriveFrontendOriginFromRequest(
      new Request('https://hashpass.tech/api/auth/oauth/login')
    )).toBeNull();

    expect(
      resolveFrontendOrigin({
        request: new Request('https://hashpass.tech/api/auth/oauth/login'),
        candidates: ['https://hashpass.tech'],
        fallbackOrigin: 'https://api.hashpass.tech',
      })
    ).toBe('https://hashpass.tech');
  });
});
