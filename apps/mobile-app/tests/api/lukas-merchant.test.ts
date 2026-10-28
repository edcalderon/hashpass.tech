/// <reference types="jest" />

const mockValidateToken = jest.fn();
const mockRateLimitOk = jest.fn();
const mockSendLukasMerchantInquiry = jest.fn();

jest.mock('@/lib/cap-instance', () => ({
  __esModule: true,
  default: { validateToken: (...args: unknown[]) => mockValidateToken(...args) },
}));
jest.mock('@/lib/bsl/rateLimit', () => ({
  rateLimitOk: (...args: unknown[]) => mockRateLimitOk(...args),
}));
jest.mock('@/lib/email', () => ({
  sendLukasMerchantInquiry: (...args: unknown[]) => mockSendLukasMerchantInquiry(...args),
}));

const requestFor = (body: Record<string, unknown>) => new Request('https://api.hashpass.tech/api/lukas/merchant', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.42' },
  body: JSON.stringify(body),
});

const validBody = {
  contactName: '  Ada Organizer  ',
  email: ' ADA@example.com ',
  merchantType: 'Coffee shop',
  description: 'We want to accept LUKAS at our Bogotá locations.',
  bookingPreference: 'Book a call',
  captchaToken: 'cap-token-once',
};

describe('POST /api/lukas/merchant', () => {
  beforeEach(() => {
    jest.resetModules();
    mockValidateToken.mockReset().mockResolvedValue({ success: true });
    mockRateLimitOk.mockReset().mockReturnValue(true);
    mockSendLukasMerchantInquiry.mockReset().mockResolvedValue({ success: true, messageId: 'merchant-1' });
  });

  it('validates CAPTCHA and sends the merchant inquiry with the booking link', async () => {
    const { POST } = require('../../app/api/lukas/merchant+api');
    const response = await POST(requestFor(validBody));

    expect(response.status).toBe(201);
    expect(mockValidateToken).toHaveBeenCalledWith('cap-token-once');
    expect(mockSendLukasMerchantInquiry).toHaveBeenCalledWith({
      contactName: 'Ada Organizer',
      email: 'ada@example.com',
      merchantType: 'Coffee shop',
      description: 'We want to accept LUKAS at our Bogotá locations.',
      bookingPreference: 'Book a call',
    });
    await expect(response.json()).resolves.toMatchObject({ success: true, bookingUrl: 'https://calendar.app.google/vYsTa9GpamSVccAt9' });
  });

  it('handles preflight, content-type, and request-rate-limit guards', async () => {
    const { OPTIONS, POST } = require('../../app/api/lukas/merchant+api');
    expect(OPTIONS().status).toBe(204);

    expect((await POST(new Request('https://api.hashpass.tech/api/lukas/merchant', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(validBody),
    }))).status).toBe(400);

    mockRateLimitOk.mockReturnValueOnce(false);
    expect((await POST(requestFor(validBody))).status).toBe(429);
    expect(mockValidateToken).not.toHaveBeenCalled();
  });

  it('rejects malformed requests and handles email-rate-limit and CAPTCHA failures', async () => {
    const { POST } = require('../../app/api/lukas/merchant+api');
    const malformed = await POST(new Request('https://api.hashpass.tech/api/lukas/merchant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{malformed',
    }));
    expect(malformed.status).toBe(400);

    mockRateLimitOk.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect((await POST(requestFor(validBody))).status).toBe(429);

    mockRateLimitOk.mockReturnValue(true);
    mockValidateToken.mockRejectedValueOnce(new Error('captcha service unavailable'));
    expect((await POST(requestFor(validBody))).status).toBe(400);
    expect(mockSendLukasMerchantInquiry).not.toHaveBeenCalled();
  });

  it('returns a gateway error when inquiry delivery fails', async () => {
    const { POST } = require('../../app/api/lukas/merchant+api');
    mockSendLukasMerchantInquiry.mockResolvedValueOnce({ success: false, error: 'smtp unavailable' });

    const response = await POST(requestFor(validBody));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to send the merchant request right now.' });
  });

  it('rejects missing or replayed CAPTCHA proof before delivery', async () => {
    const { POST } = require('../../app/api/lukas/merchant+api');
    const missing = await POST(requestFor({ ...validBody, captchaToken: '' }));
    expect(missing.status).toBe(400);

    mockValidateToken.mockResolvedValueOnce({ success: false });
    const replay = await POST(requestFor(validBody));
    expect(replay.status).toBe(400);
    expect(mockSendLukasMerchantInquiry).not.toHaveBeenCalled();
  });
});
