/// <reference types="jest" />

const mockGenerateLink = jest.fn();
const mockSendAuthenticationMagicLink = jest.fn();
const mockRateLimitOk = jest.fn();

jest.mock('../../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: jest.fn(() => ({
    auth: { admin: { generateLink: mockGenerateLink } },
  })),
}));

jest.mock('../../../lib/email', () => ({
  sendAuthenticationMagicLink: mockSendAuthenticationMagicLink,
}));

jest.mock('../../../lib/bsl/rateLimit', () => ({
  rateLimitOk: mockRateLimitOk,
}));

const requestFor = (body: unknown) =>
  new Request('https://api.hashpass.tech/api/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('magic-link API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGenerateLink.mockReset();
    mockSendAuthenticationMagicLink.mockReset();
    mockRateLimitOk.mockReset();
    mockRateLimitOk.mockReturnValue(true);
  });

  it('mints a signed Supabase action link and delivers it through the backend mailer', async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: { action_link: 'https://project.supabase.co/auth/v1/verify?token=one-time' } },
      error: null,
    });
    mockSendAuthenticationMagicLink.mockResolvedValue({ success: true });

    const { POST } = require('../../../app/api/auth/magic-link+api');
    const response = await POST(
      requestFor({
        email: 'User@Example.com',
        redirectTo: 'https://hashpass.tech/auth/callback',
        locale: 'es',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'user@example.com',
      options: {
        redirectTo: 'https://hashpass.tech/auth/callback',
        data: { locale: 'es' },
      },
    });
    expect(mockSendAuthenticationMagicLink).toHaveBeenCalledWith({
      email: 'user@example.com',
      actionLink: 'https://project.supabase.co/auth/v1/verify?token=one-time',
      locale: 'es',
    });
  });

  it('handles preflight and invalid public requests without contacting Supabase', async () => {
    const { OPTIONS, POST } = require('../../../app/api/auth/magic-link+api');
    await expect(OPTIONS()).resolves.toMatchObject({ status: 204 });

    const invalidJson = await POST({ json: async () => { throw new Error('invalid'); } });
    expect(invalidJson.status).toBe(400);

    const invalidEmail = await POST(requestFor({
      email: 'not-an-email',
      redirectTo: 'https://hashpass.tech/auth/callback',
    }));
    expect(invalidEmail.status).toBe(400);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('rejects a callback that cannot receive a passwordless payload', async () => {
    const { POST } = require('../../../app/api/auth/magic-link+api');
    const response = await POST(
      requestFor({
        email: 'user@example.com',
        redirectTo: 'https://hashpass.tech/auth/callback/',
      }),
    );

    expect(response.status).toBe(400);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('does not report delivery as successful when the mailer fails', async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: { action_link: 'https://project.supabase.co/auth/v1/verify?token=one-time' } },
      error: null,
    });
    mockSendAuthenticationMagicLink.mockResolvedValue({
      success: false,
      code: 'email_send_failed',
    });

    const { POST } = require('../../../app/api/auth/magic-link+api');
    const response = await POST(
      requestFor({
        email: 'user@example.com',
        redirectTo: 'https://hashpass.tech/auth/callback',
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: 'email_send_failed' });
  });

  it('returns a configuration status when transactional mail is unavailable', async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: { action_link: 'https://project.supabase.co/auth/v1/verify?token=one-time' } },
      error: null,
    });
    mockSendAuthenticationMagicLink.mockResolvedValue({
      success: false,
      code: 'email_not_configured',
    });

    const { POST } = require('../../../app/api/auth/magic-link+api');
    const response = await POST(requestFor({
      email: 'user@example.com',
      redirectTo: 'https://hashpass.tech/auth/callback',
    }));

    expect(response.status).toBe(503);
  });

  it('preserves Supabase rate limiting instead of minting another link', async () => {
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { status: 429 },
    });

    const { POST } = require('../../../app/api/auth/magic-link+api');
    const response = await POST(
      requestFor({
        email: 'user@example.com',
        redirectTo: 'https://hashpass.tech/auth/callback',
      }),
    );

    expect(response.status).toBe(429);
    expect(mockSendAuthenticationMagicLink).not.toHaveBeenCalled();
  });

  it('throttles repeated delivery attempts before generating a credential', async () => {
    mockRateLimitOk.mockReturnValueOnce(false);

    const { POST } = require('../../../app/api/auth/magic-link+api');
    const response = await POST(
      new Request('https://api.hashpass.tech/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.16, 10.0.0.1',
        },
        body: JSON.stringify({
          email: 'user@example.com',
          redirectTo: 'https://hashpass.tech/auth/callback',
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(mockRateLimitOk).toHaveBeenCalledWith('magic-link:ip:198.51.100.16');
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('does not expose an unexpected backend failure', async () => {
    mockGenerateLink.mockRejectedValue(new Error('network failure'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { POST } = require('../../../app/api/auth/magic-link+api');
    const response = await POST(requestFor({
      email: 'user@example.com',
      redirectTo: 'https://hashpass.tech/auth/callback',
    }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: 'magic_link_send_failed' });
    errorSpy.mockRestore();
  });
});
