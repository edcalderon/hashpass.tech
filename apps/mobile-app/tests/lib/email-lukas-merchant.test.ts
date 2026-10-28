/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: mockSendMail })) },
}));

jest.mock('@hashpass/emails', () => ({
  renderTemplate: jest.fn(),
  getSubject: jest.fn(),
  getEmailAssetDataUri: jest.fn(),
}));
jest.mock('../../lib/s3-service', () => ({ getEmailAssetUrl: jest.fn() }));
jest.mock('../../lib/supabase-server', () => ({ supabaseServer: {} }));
jest.mock('../../lib/email-event-branding', () => ({ getEventEmailBranding: jest.fn() }));

describe('sendLukasMerchantInquiry', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: 'merchant-message' });
    Object.assign(process.env, {
      NODEMAILER_HOST: 'smtp.example.test',
      NODEMAILER_PORT: '587',
      NODEMAILER_USER: 'mailer',
      NODEMAILER_PASS: 'x',
      NODEMAILER_FROM: 'no-reply@hashpass.tech',
    });
  });

  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) delete process.env[key];
    });
    Object.assign(process.env, originalEnv);
  });

  it('sends a sanitized inquiry to the fixed inbox and a confirmation to the merchant', async () => {
    const { sendLukasMerchantInquiry } = require('../../lib/email');

    await expect(sendLukasMerchantInquiry({
      contactName: 'Ada <script>alert(1)</script>\r\nBcc: attacker@example.com',
      email: 'ada@example.com',
      merchantType: 'Coffee shop\r\nBcc: attacker@example.com',
      description: '<img src=x onerror=alert(1)>\nWe want to accept LUKAS.',
      bookingPreference: 'Book a call',
    })).resolves.toMatchObject({ success: true, messageId: 'merchant-message' });

    expect(mockSendMail).toHaveBeenCalledTimes(2);
    const [inquiry, confirmation] = mockSendMail.mock.calls.map(([mail]) => mail);
    expect(inquiry.to).toBe('contact@hashpass.tech');
    expect(inquiry.replyTo).toBe('ada@example.com');
    expect(inquiry.subject).not.toMatch(/[\r\n]/);
    expect(inquiry.html).toContain('Ada &lt;script&gt;alert(1)&lt;/script&gt; Bcc: attacker@example.com');
    expect(inquiry.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(inquiry.html).not.toMatch(/<(?:script|img)\b/i);
    expect(confirmation.to).toBe('ada@example.com');
    expect(confirmation.html).toContain('calendar.app.google');
  });
});
