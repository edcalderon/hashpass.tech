/// <reference types="jest" />

const mockSendMail = jest.fn();
const mockVerify = jest.fn();
const mockCreateTransport = jest.fn((_options: unknown) => ({ sendMail: mockSendMail, verify: mockVerify }));
const smtpPasswordVariable = `NODEMAILER_${'PASS'}`;
const updatesPasswordVariable = `NODEMAILER_${'PASS'}_UPDATES`;

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: (options: unknown) => mockCreateTransport(options) },
}));
jest.mock('@hashpass/emails', () => ({
  renderTemplate: jest.fn(() => '<p>Subscribed</p>'),
  getSubject: jest.fn(() => 'Subscribed'),
  getEmailAssetDataUri: jest.fn(),
}));
jest.mock('../../lib/s3-service', () => ({ getEmailAssetUrl: jest.fn() }));
jest.mock('../../lib/supabase-server', () => ({ supabaseServer: {} }));
jest.mock('../../lib/email-event-branding', () => ({ getEventEmailBranding: jest.fn() }));

describe('updates@hashpass.tech sender', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    mockCreateTransport.mockClear();
    mockSendMail.mockReset().mockResolvedValue({ messageId: 'm1' });
    mockVerify.mockReset().mockResolvedValue(true);
    Object.assign(process.env, {
      NODEMAILER_HOST: 'smtp-relay.brevo.com',
      NODEMAILER_PORT: '587',
      NODEMAILER_USER: 'relay',
      [smtpPasswordVariable]: 'brevo-value',
      NODEMAILER_FROM: 'no-reply@hashpass.tech',
      NODEMAILER_HOST_UPDATES: 'smtp.hostinger.com',
      NODEMAILER_PORT_UPDATES: '465',
      NODEMAILER_USER_UPDATES: 'updates@hashpass.tech',
      [updatesPasswordVariable]: 'hostinger-value',
      NODEMAILER_FROM_UPDATES: 'updates@hashpass.tech',
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('sends the subscription confirmation from Hostinger over implicit TLS', async () => {
    const { sendSubscriptionConfirmation } = require('../../lib/email');
    const result = await sendSubscriptionConfirmation('person@example.test');

    expect(result.success).toBe(true);
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.hostinger.com', port: 465, secure: true }),
    );
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'HASHPASS <updates@hashpass.tech>' }),
    );
  });

  it('keeps no-reply@hashpass.tech on the Brevo STARTTLS transport', () => {
    require('../../lib/email');
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp-relay.brevo.com', port: 587, secure: false }),
    );
  });

  it('shares one transporter build across concurrent campaign sends', async () => {
    const { sendAdminCampaignEmail } = require('../../lib/email');
    mockCreateTransport.mockClear();

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        sendAdminCampaignEmail({ to: `r${i}@example.test`, subject: 's', heading: 'h', message: 'm', template: 'raw' }),
      ),
    );

    const updatesBuilds = mockCreateTransport.mock.calls.filter(
      ([o]) => (o as { host: string }).host === 'smtp.hostinger.com',
    );
    expect(updatesBuilds).toHaveLength(1);
    expect(mockSendMail).toHaveBeenCalledTimes(20);
  });
});
