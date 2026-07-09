/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

describe('better-auth-error-redirect', () => {
  const originalEnv = {
    EXPO_PUBLIC_FRONTEND_URL: process.env.EXPO_PUBLIC_FRONTEND_URL,
    FRONTEND_URL: process.env.FRONTEND_URL,
    EXPO_PUBLIC_SITE_URL: process.env.EXPO_PUBLIC_SITE_URL,
    SITE_URL: process.env.SITE_URL,
  };

  beforeEach(() => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_FRONTEND_URL;
    delete process.env.FRONTEND_URL;
    delete process.env.EXPO_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
  });

  afterAll(() => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    });
  });

  it('builds frontend auth redirects for production state mismatch errors', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      buildBetterAuthErrorRedirectURL,
    } = require('../../../lib/server/better-auth-error-redirect');

    const request = new Request(
      'https://api.hashpass.tech/api/auth/callback/google?state=bad'
    );

    expect(
      buildBetterAuthErrorRedirectURL(
        request,
        'https://api.hashpass.tech/api/auth/error?error=state_mismatch'
      )
    ).toBe(
      'https://hashpass.tech/auth?error=state_mismatch&message=Google+sign-in+expired+or+could+not+be+verified.+Please+try+again.'
    );
  });

  it('rewrites Better Auth callback redirects that point at the API auth error route', () => {
    const {
      rewriteBetterAuthErrorRedirect,
    } = require('../../../lib/server/better-auth-error-redirect');
    const request = new Request(
      'https://api.hashpass.tech/api/auth/callback/google?state=bad'
    );
    const response = new Response(null, {
      status: 302,
      headers: {
        location: 'https://api.hashpass.tech/api/auth/error?error=please_restart_the_process',
      },
    });

    const rewritten = rewriteBetterAuthErrorRedirect(request, response);

    expect(rewritten.status).toBe(302);
    expect(rewritten.headers.get('location')).toBe(
      'https://hashpass.tech/auth?error=please_restart_the_process&message=Google+sign-in+expired+or+could+not+be+verified.+Please+try+again.'
    );
    expect(rewritten.headers.get('cache-control')).toBe('no-store');
  });

  it('redirects direct /auth/error requests before Better Auth can send users to the API root', () => {
    const {
      createBetterAuthErrorRedirect,
    } = require('../../../lib/server/better-auth-error-redirect');

    const redirect = createBetterAuthErrorRedirect(
      new Request('https://api.hashpass.tech/api/auth/error?error=state_mismatch')
    );

    expect(redirect?.status).toBe(302);
    expect(redirect?.headers.get('location')).toBe(
      'https://hashpass.tech/auth?error=state_mismatch&message=Google+sign-in+expired+or+could+not+be+verified.+Please+try+again.'
    );
  });

  it('keeps local development auth errors on localhost', () => {
    const {
      buildBetterAuthErrorRedirectURL,
    } = require('../../../lib/server/better-auth-error-redirect');

    const request = new Request(
      'http://localhost:8081/api/auth/error?error=state_mismatch'
    );

    expect(buildBetterAuthErrorRedirectURL(request)).toBe(
      'http://localhost:8081/auth?error=state_mismatch&message=Google+sign-in+expired+or+could+not+be+verified.+Please+try+again.'
    );
  });

  it('uses a safe frontend env origin and preserves safe return paths', () => {
    process.env.FRONTEND_URL = 'https://bsl.hashpass.tech';
    const {
      buildBetterAuthErrorRedirectURL,
    } = require('../../../lib/server/better-auth-error-redirect');

    const request = new Request('https://api.hashpass.tech/api/auth/callback/google');

    expect(
      buildBetterAuthErrorRedirectURL(
        request,
        'https://api.hashpass.tech/api/auth/error?reason=invalid_code&returnTo=%2Fevents%2Fbsl%2Fhome'
      )
    ).toBe(
      'https://bsl.hashpass.tech/auth?error=invalid_code&message=Google+sign-in+could+not+be+verified.+Please+try+again.&returnTo=%2Fevents%2Fbsl%2Fhome'
    );
  });

  it('falls back to dev frontend for api-dev auth errors', () => {
    const {
      buildBetterAuthErrorRedirectURL,
    } = require('../../../lib/server/better-auth-error-redirect');

    expect(
      buildBetterAuthErrorRedirectURL(
        new Request('https://api-dev.hashpass.tech/api/auth/error?state=state_not_found')
      )
    ).toBe(
      'https://dev.hashpass.tech/auth?error=state_not_found&message=Google+sign-in+expired+or+could+not+be+verified.+Please+try+again.'
    );
  });

  it('ignores unsafe env origins and unsafe return paths', () => {
    process.env.FRONTEND_URL = 'https://api.hashpass.tech';
    process.env.SITE_URL = 'ftp://hashpass.tech';
    const {
      buildBetterAuthErrorRedirectURL,
    } = require('../../../lib/server/better-auth-error-redirect');

    expect(
      buildBetterAuthErrorRedirectURL(
        new Request('https://api.hashpass.tech/api/auth/error?error=oauth_provider_not_found'),
        'http://[invalid-url'
      )
    ).toBe(
      'https://hashpass.tech/auth?error=oauth_provider_not_found&message=Google+sign-in+is+not+configured.+Please+contact+support.'
    );
  });

  it('rewrites Better Auth root error redirects from auth routes', () => {
    const {
      rewriteBetterAuthErrorRedirect,
    } = require('../../../lib/server/better-auth-error-redirect');
    const request = new Request(
      'https://api.hashpass.tech/api/auth/error?error=no_code'
    );
    const response = new Response(null, {
      status: 302,
      headers: {
        location: '/?error=no_code&error_description=No+verification+code',
      },
    });

    const rewritten = rewriteBetterAuthErrorRedirect(request, response);

    expect(rewritten.headers.get('location')).toBe(
      'https://hashpass.tech/auth?error=no_code&message=No+verification+code'
    );
  });

  it('does not redirect Better Auth error routes without error parameters', () => {
    const {
      createBetterAuthErrorRedirect,
    } = require('../../../lib/server/better-auth-error-redirect');

    expect(
      createBetterAuthErrorRedirect(
        new Request('https://api.hashpass.tech/api/auth/error')
      )
    ).toBeNull();
  });

  it('does not rewrite successful frontend callback redirects', () => {
    const {
      rewriteBetterAuthErrorRedirect,
    } = require('../../../lib/server/better-auth-error-redirect');
    const request = new Request(
      'https://api.hashpass.tech/api/auth/callback/google?state=valid'
    );
    const response = new Response(null, {
      status: 302,
      headers: {
        location: 'https://hashpass.tech/auth/callback?returnTo=%2Fdashboard%2Fexplore',
      },
    });

    expect(rewriteBetterAuthErrorRedirect(request, response)).toBe(response);
  });
});
