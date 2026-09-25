/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

const mockGenerateLink = jest.fn();
const mockGetSupabaseServerEnv = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn();

jest.mock('../../../lib/supabase-server', () => ({
  getSupabaseServerEnv: mockGetSupabaseServerEnv,
  getSupabaseServerForRequest: mockGetSupabaseServerForRequest,
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('otp send api', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGenerateLink.mockReset();
    mockGetSupabaseServerEnv.mockReset();
    mockGetSupabaseServerForRequest.mockReset();

    mockGetSupabaseServerEnv.mockReturnValue({
      supabaseUrl: 'https://example.supabase.co',
      supabaseServiceKey: 'service-role-key',
      selectedProfile: 'core-production',
      usingDevFallback: false,
    });
    mockGetSupabaseServerForRequest.mockReturnValue({
      auth: { admin: { generateLink: mockGenerateLink } },
    });
  });

  it('rejects arbitrary SMS destinations before creating an identity challenge', async () => {
    const { POST } = require('../../../app/api/auth/otp+api');

    const response = await POST(new Request('https://api.hashpass.tech/api/auth/otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        delivery: 'sms',
        phone: '+573001112233',
      }),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'trusted_phone_required',
    });
    expect(mockGetSupabaseServerForRequest).not.toHaveBeenCalled();
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it('does not expose raw identity-provider database failures', async () => {
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: 'Database error saving new user', status: 500 },
    });
    const { POST } = require('../../../app/api/auth/otp+api');

    const response = await POST(new Request('https://api.hashpass.tech/api/auth/otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', delivery: 'email' }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ code: 'auth_service_unavailable' });
    expect(JSON.stringify(payload)).not.toContain('Database error saving new user');
  });

  it('keeps an identity-provider client rejection a client error while sanitizing it', async () => {
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: 'email address is not allowed', status: 422 },
    });
    const { POST } = require('../../../app/api/auth/otp+api');

    const response = await POST(new Request('https://api.hashpass.tech/api/auth/otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', delivery: 'email' }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({ code: 'auth_request_rejected' });
    expect(JSON.stringify(payload)).not.toContain('email address is not allowed');
  });
});
