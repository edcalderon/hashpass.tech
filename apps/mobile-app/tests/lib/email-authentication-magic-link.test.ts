/// <reference types="jest" />

const mockSendMail = jest.fn();
const mockRenderTemplate = jest.fn();
const mockGetSubject = jest.fn();
const smtpPasswordVariable = `NODEMAILER_${'PASS'}`;

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: mockSendMail })) },
}));

jest.mock('@hashpass/emails', () => ({
  renderTemplate: mockRenderTemplate,
  getSubject: mockGetSubject,
  getEmailAssetDataUri: jest.fn(),
}));

jest.mock('../../lib/s3-service', () => ({ getEmailAssetUrl: jest.fn() }));
jest.mock('../../lib/supabase-server', () => ({ supabaseServer: {} }));
jest.mock('../../lib/email-event-branding', () => ({ getEventEmailBranding: jest.fn() }));

const mailEnv = [
  'NODEMAILER_HOST',
  'NODEMAILER_PORT',
  'NODEMAILER_USER',
  'NODEMAILER_PASS',
  'NODEMAILER_FROM',
] as const;

describe('sendAuthenticationMagicLink', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    mockSendMail.mockReset();
    mockRenderTemplate.mockReset();
    mockGetSubject.mockReset();
    Object.assign(process.env, {
      NODEMAILER_HOST: 'smtp.example.test',
      NODEMAILER_PORT: '587',
      NODEMAILER_USER: 'mailer',
      NODEMAILER_FROM: 'no-reply@hashpass.tech',
      [smtpPasswordVariable]: 'test-value',
    });
  });

  afterEach(() => {
    for (const key of mailEnv) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('replaces the template placeholder with the generated one-time verification URL', async () => {
    mockRenderTemplate.mockReturnValue('<a href="{{ .ConfirmationURL }}">Continue</a>');
    mockGetSubject.mockReturnValue('Secure link');
    mockSendMail.mockResolvedValue({ messageId: 'test-message' });

    const { sendAuthenticationMagicLink } = require('../../lib/email');
    const result = await sendAuthenticationMagicLink({
      email: 'user@example.com',
      actionLink: 'https://project.supabase.co/auth/v1/verify?token=a&redirect_to=https://hashpass.tech/auth/callback',
      locale: 'es',
    });

    expect(result).toEqual({ success: true });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      subject: 'Secure link',
      html: '<a href="https://project.supabase.co/auth/v1/verify?token=a&amp;redirect_to=https://hashpass.tech/auth/callback">Continue</a>',
    }));
  });

  it('reports SMTP delivery failures without exposing them to the caller', async () => {
    mockRenderTemplate.mockReturnValue('{{ .ConfirmationURL }}');
    mockGetSubject.mockReturnValue('Secure link');
    mockSendMail.mockRejectedValue(new Error('SMTP unavailable'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { sendAuthenticationMagicLink } = require('../../lib/email');
    await expect(sendAuthenticationMagicLink({
      email: 'user@example.com',
      actionLink: 'https://project.supabase.co/auth/v1/verify?token=a',
    })).resolves.toEqual({ success: false, code: 'email_send_failed' });

    errorSpy.mockRestore();
  });

  it('refuses delivery when transactional SMTP is unavailable', async () => {
    for (const key of mailEnv) delete process.env[key];
    jest.resetModules();

    const { sendAuthenticationMagicLink } = require('../../lib/email');
    await expect(sendAuthenticationMagicLink({
      email: 'user@example.com',
      actionLink: 'https://project.supabase.co/auth/v1/verify?token=a',
    })).resolves.toEqual({ success: false, code: 'email_not_configured' });
  });
});
