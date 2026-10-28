/// <reference types="jest" />

const mockValidateToken = jest.fn();
const mockRateLimitOk = jest.fn();
const mockSendAuthOtp = jest.fn();

jest.mock('@/lib/cap-instance', () => ({
  __esModule: true,
  default: { validateToken: (...args: unknown[]) => mockValidateToken(...args) },
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (...args: unknown[]) => mockRateLimitOk(...args),
}));
jest.mock('../../app/api/auth/otp+api', () => ({
  POST: (...args: unknown[]) => mockSendAuthOtp(...args),
}));

const requestFor = (body: Record<string, unknown>) => new Request('https://api.hashpass.tech/api/lukas/claim/otp', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.12' },
  body: JSON.stringify(body),
});

describe('POST /api/lukas/claim/otp', () => {
  beforeEach(() => {
    jest.resetModules();
    mockValidateToken.mockReset().mockResolvedValue({ success: true });
    mockRateLimitOk.mockReset().mockReturnValue(true);
    mockSendAuthOtp.mockReset().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
  });

  it('validates the email and CAPTCHA before delegating to the shared OTP sender', async () => {
    const { POST } = require('../../app/api/lukas/claim/otp+api');
    const response = await POST(requestFor({ email: ' ADA@example.com ', captchaToken: 'cap-token-once' }));

    expect(response.status).toBe(200);
    expect(mockValidateToken).toHaveBeenCalledWith('cap-token-once');
    expect(mockSendAuthOtp).toHaveBeenCalledTimes(1);
    const forwardedRequest = mockSendAuthOtp.mock.calls[0][0] as Request;
    await expect(forwardedRequest.json()).resolves.toEqual({ email: 'ada@example.com' });
  });

  it('exposes the native-client preflight and rate-limit guard', async () => {
    const { OPTIONS, POST } = require('../../app/api/lukas/claim/otp+api');
    expect(OPTIONS().status).toBe(204);

    mockRateLimitOk.mockReturnValueOnce(false);
    expect((await POST(requestFor({ email: 'ada@example.com', captchaToken: 'cap-token-once' }))).status).toBe(429);
    expect(mockValidateToken).not.toHaveBeenCalled();
  });

  it('returns the expired response when CAPTCHA validation throws', async () => {
    const { POST } = require('../../app/api/lukas/claim/otp+api');
    mockValidateToken.mockRejectedValueOnce(new Error('captcha unavailable'));

    const response = await POST(requestFor({ email: 'ada@example.com', captchaToken: 'cap-token-once' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ captchaExpired: true });
    expect(mockSendAuthOtp).not.toHaveBeenCalled();
  });

  it('rejects invalid or replayed CAPTCHA proof without sending an OTP', async () => {
    const { POST } = require('../../app/api/lukas/claim/otp+api');
    expect((await POST(requestFor({ email: 'not-an-email', captchaToken: 'cap-token-once' }))).status).toBe(400);

    mockValidateToken.mockResolvedValueOnce({ success: false });
    expect((await POST(requestFor({ email: 'ada@example.com', captchaToken: 'cap-token-once' }))).status).toBe(400);
    expect(mockSendAuthOtp).not.toHaveBeenCalled();
  });
});
