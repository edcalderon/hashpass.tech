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

  const marketingMessage = { to: 'fixture@example.test', subject: 'Campaign', html: '<p>Preview</p>', text: 'Preview', unsubscribeUrl: 'https://api.hashpass.tech/api/marketing/unsubscribe?token=opaque', deliveryId: 'delivery-uuid' };
  it('sends auditable campaign messages with one-click opt-out headers', async () => {
    const { marketingSenderReady, sendMarketingMessage } = require('../../lib/email');
    expect(await marketingSenderReady()).toBe(true);
    mockSendMail.mockResolvedValueOnce({ messageId: 'm1', accepted: [marketingMessage.to] });
    expect(await sendMarketingMessage(marketingMessage)).toEqual({ status: 'accepted', messageId: 'm1' });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      messageId: '<marketing-delivery-uuid@hashpass.tech>',
      headers: { 'List-Unsubscribe': `<${marketingMessage.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }));
  });
  it('sends optional campaign preview images as inline MIME attachments', async () => {
    const { sendMarketingMessage } = require('../../lib/email');
    const attachments = [{ filename: 'preview.jpg', content: Buffer.from('preview'), contentType: 'image/jpeg', cid: 'campaign-preview' }];
    mockSendMail.mockResolvedValueOnce({ messageId: 'm2', accepted: [marketingMessage.to] });

    await sendMarketingMessage({ ...marketingMessage, attachments });

    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [{ ...attachments[0], contentDisposition: 'inline' }],
    }));
  });
  it('distinguishes provider rejection from uncertain network outcomes', async () => {
    const { sendMarketingMessage } = require('../../lib/email');
    mockSendMail.mockResolvedValueOnce({ rejected: ['fixture@example.test'] });
    expect((await sendMarketingMessage(marketingMessage)).status).toBe('failed');
    mockSendMail.mockRejectedValueOnce({ responseCode: 550 });
    expect(await sendMarketingMessage(marketingMessage)).toEqual({ status: 'failed', errorCode: 'smtp_rejected' });
    mockSendMail.mockRejectedValueOnce(new Error('socket closed after submission'));
    expect(await sendMarketingMessage(marketingMessage)).toEqual({ status: 'unknown', errorCode: 'transport_outcome_uncertain' });
    mockSendMail.mockResolvedValueOnce({ messageId: 'm1', accepted: [] });
    expect(await sendMarketingMessage(marketingMessage)).toEqual({ status: 'unknown', errorCode: 'provider_acceptance_unconfirmed' });
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

  describe('without local _UPDATES env (deployed Lambda)', () => {
    const clearUpdatesEnv = () => {
      for (const key of ['HOST', 'PORT', 'USER', 'PASS', 'FROM']) delete process.env[`NODEMAILER_${key}_UPDATES`];
    };
    const campaign = { to: 'r@example.test', subject: 's', heading: 'h', message: 'm', template: 'raw' };

    it('falls back to the primary sender when Infisical lookup throws', async () => {
      clearUpdatesEnv();
      jest.doMock('../../lib/server/infisical-secrets', () => ({
        getInfisicalSecret: jest.fn(async () => {
          throw new Error('infisical down');
        }),
      }));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { sendAdminCampaignEmail } = require('../../lib/email');

      await sendAdminCampaignEmail(campaign);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'HASHPASS <no-reply@hashpass.tech>' }),
      );
    });

    it('builds the Hostinger sender from Infisical values and defaults the port', async () => {
      clearUpdatesEnv();
      const values: Record<string, string> = {
        NODEMAILER_HOST_UPDATES: 'smtp.hostinger.com',
        NODEMAILER_USER_UPDATES: 'updates@hashpass.tech',
        [updatesPasswordVariable]: 'hostinger-value',
        NODEMAILER_FROM_UPDATES: 'updates@hashpass.tech',
      };
      jest.doMock('../../lib/server/infisical-secrets', () => ({
        getInfisicalSecret: jest.fn(async (key: string) => values[key]),
      }));
      const { sendAdminCampaignEmail } = require('../../lib/email');

      await sendAdminCampaignEmail(campaign);

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'smtp.hostinger.com', port: 587 }),
      );
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'HASHPASS <updates@hashpass.tech>' }),
      );
    });

    it('falls back to the primary sender when Infisical has no values', async () => {
      clearUpdatesEnv();
      jest.doMock('../../lib/server/infisical-secrets', () => ({
        getInfisicalSecret: jest.fn(async () => undefined),
      }));
      const { sendAdminCampaignEmail } = require('../../lib/email');

      await sendAdminCampaignEmail(campaign);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'HASHPASS <no-reply@hashpass.tech>' }),
      );
    });
  });

  it('resolves the info sender before validating the welcome email address', async () => {
    jest.doMock('../../lib/server/infisical-secrets', () => ({ getInfisicalSecret: jest.fn(async () => undefined) }));
    const { sendWelcomeEmail } = require('../../lib/email');

    await expect(sendWelcomeEmail('not-an-email')).resolves.toEqual({ success: false, error: 'Invalid email address' });
  });

  it('returns the delivery error when the campaign send fails', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('smtp rejected'));
    const { sendAdminCampaignEmail } = require('../../lib/email');

    await expect(
      sendAdminCampaignEmail({ to: 'r@example.test', subject: 's', heading: 'h', message: 'm', template: 'raw' }),
    ).resolves.toEqual({ success: false, error: 'smtp rejected' });
  });

  it('reports unconfigured when neither sender exists', async () => {
    for (const key of ['HOST', 'PORT', 'USER', 'PASS', 'FROM']) {
      delete process.env[`NODEMAILER_${key}_UPDATES`];
      delete process.env[`NODEMAILER_${key}`];
    }
    jest.doMock('../../lib/server/infisical-secrets', () => ({ getInfisicalSecret: jest.fn(async () => undefined) }));
    const { sendAdminCampaignEmail } = require('../../lib/email');

    await expect(
      sendAdminCampaignEmail({ to: 'r@example.test', subject: 's', heading: 'h', message: 'm', template: 'raw' }),
    ).resolves.toEqual({ success: false, error: 'Email service is not configured' });
  });
});
