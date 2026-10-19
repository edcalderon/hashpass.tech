/// <reference types="jest" />

const mockSendMail = jest.fn();
const mockVerify = jest.fn();
const mockRenderTemplate = jest.fn();
const mockGetSubject = jest.fn();
const smtpPasswordVariable = `NODEMAILER_${'PASS'}`;

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({ sendMail: mockSendMail, verify: mockVerify })),
  },
}));

jest.mock('@hashpass/emails', () => ({
  renderTemplate: mockRenderTemplate,
  getSubject: mockGetSubject,
  getEmailAssetDataUri: jest.fn(),
}));

jest.mock('../../lib/s3-service', () => ({ getEmailAssetUrl: jest.fn() }));
jest.mock('../../lib/supabase-server', () => ({ supabaseServer: {} }));
jest.mock('../../lib/email-event-branding', () => ({ getEventEmailBranding: jest.fn() }));

describe('sendSubscriptionConfirmation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    mockSendMail.mockReset();
    mockVerify.mockReset();
    mockRenderTemplate.mockReset();
    mockGetSubject.mockReset();
    mockVerify.mockResolvedValue(true);
    mockSendMail.mockResolvedValue({ messageId: 'subscription-message' });
    mockRenderTemplate.mockReturnValue('<p>You are subscribed.</p>');
    mockGetSubject.mockReturnValue('You’re subscribed to HASHPASS updates');
    Object.assign(process.env, {
      NODEMAILER_HOST: 'smtp.example.test',
      NODEMAILER_PORT: '587',
      NODEMAILER_USER: 'mailer',
      [smtpPasswordVariable]: 'test-value',
      NODEMAILER_FROM: 'no-reply@hashpass.tech',
      NODEMAILER_FROM_SUPPORT: 'support@hashpass.tech',
    });
  });

  afterEach(() => {
    for (const key of [
      'NODEMAILER_HOST',
      'NODEMAILER_PORT',
      'NODEMAILER_USER',
      'NODEMAILER_PASS',
      'NODEMAILER_FROM',
      'NODEMAILER_FROM_SUPPORT',
    ]) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('sends an actionable text alternative and a real support reply-to address', async () => {
    const { sendSubscriptionConfirmation } = require('../../lib/email');
    const unsubscribeUrl = 'https://hashpass.tech/api/unsubscribe?token=test';

    await expect(
      sendSubscriptionConfirmation('reader@example.com', 'en', unsubscribeUrl),
    ).resolves.toEqual({ success: true, messageId: 'subscription-message' });

    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'HASHPASS <no-reply@hashpass.tech>',
      replyTo: 'support@hashpass.tech',
      to: 'reader@example.com',
      subject: 'You’re subscribed to HASHPASS updates',
      text: expect.stringContaining('Unsubscribe: https://hashpass.tech/api/unsubscribe?token=test'),
    }));
    expect(mockSendMail.mock.calls[0][0].text).toContain('Questions? Reply to this email');
  });

  it('defaults the reply-to to support@ and omits the unsubscribe line when no link is given', async () => {
    delete process.env.NODEMAILER_FROM_SUPPORT;
    const { sendSubscriptionConfirmation } = require('../../lib/email');

    await sendSubscriptionConfirmation('reader@example.com', 'en');

    const sent = mockSendMail.mock.calls[0][0];
    expect(sent.replyTo).toBe('support@hashpass.tech');
    expect(sent.text).not.toContain('Unsubscribe:');
  });

  it('honors a custom NODEMAILER_FROM_SUPPORT address', async () => {
    process.env.NODEMAILER_FROM_SUPPORT = 'help@hashpass.tech';
    const { sendSubscriptionConfirmation } = require('../../lib/email');

    await sendSubscriptionConfirmation('reader@example.com', 'en');

    expect(mockSendMail.mock.calls[0][0].replyTo).toBe('help@hashpass.tech');
  });

  it('rejects an invalid recipient address without sending', async () => {
    const { sendSubscriptionConfirmation } = require('../../lib/email');

    const result = await sendSubscriptionConfirmation('not-an-email', 'en');

    expect(result.success).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('reports the service as unconfigured when no sender is available', async () => {
    for (const key of ['NODEMAILER_HOST', 'NODEMAILER_PORT', 'NODEMAILER_USER', 'NODEMAILER_PASS', 'NODEMAILER_FROM']) {
      delete process.env[key];
    }
    const { sendSubscriptionConfirmation } = require('../../lib/email');

    await expect(sendSubscriptionConfirmation('reader@example.com', 'en')).resolves.toEqual({
      success: false,
      error: 'Email service is not configured',
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
