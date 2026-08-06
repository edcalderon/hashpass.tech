/// <reference types="jest" />

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => input),
}));

const ENV_KEYS = ['INFISICAL_DOMAIN', 'INFISICAL_PROJECT_ID', 'INFISICAL_CLIENT_ID', 'INFISICAL_CLIENT_SECRET', 'NODE_ENV'];

describe('getInfisicalSecret', () => {
  const originalEnv: Record<string, string | undefined> = {};
  let originalFetch: typeof fetch;

  beforeEach(() => {
    jest.resetModules();
    mockSend.mockReset();
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
    originalFetch = global.fetch;
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    global.fetch = originalFetch;
  });

  function mockInfisicalHttp(secretKey: string, secretValue: string) {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'test-token', expiresIn: 7200 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ secrets: [{ secretKey, secretValue }] }),
      });
  }

  it('resolves credentials from env vars without touching Secrets Manager', async () => {
    process.env.INFISICAL_DOMAIN = 'https://secrets.example.com';
    process.env.INFISICAL_PROJECT_ID = 'proj-123';
    process.env.INFISICAL_CLIENT_ID = 'client-id';
    process.env.INFISICAL_CLIENT_SECRET = 'example-client-secret';
    mockInfisicalHttp('NODEMAILER_FROM_INFO', 'no-reply@hashpass.info');

    const { getInfisicalSecret } = require('../../lib/server/infisical-secrets');
    const value = await getInfisicalSecret('NODEMAILER_FROM_INFO');

    expect(value).toBe('no-reply@hashpass.info');
    expect(mockSend).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://secrets.example.com/api/v1/auth/universal-auth/login',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('falls back to Secrets Manager when env vars are not set, using the dev slug by default', async () => {
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({
        domain: 'https://secrets.example.com',
        projectId: 'proj-123',
        clientId: 'sm-client-id',
        clientSecret: 'sm-client-secret',
      }),
    });
    mockInfisicalHttp('NODEMAILER_FROM_INFO', 'no-reply@hashpass.info');

    const { getInfisicalSecret } = require('../../lib/server/infisical-secrets');
    const value = await getInfisicalSecret('NODEMAILER_FROM_INFO');

    expect(value).toBe('no-reply@hashpass.info');
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ SecretId: 'hashpass/expo-router-api-dev/infisical-bootstrap' })
    );
  });

  it('uses the prod secret name when NODE_ENV is production', async () => {
    Object.assign(process.env, { NODE_ENV: 'production' });
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({
        domain: 'https://secrets.example.com',
        projectId: 'proj-123',
        clientId: 'sm-client-id',
        clientSecret: 'sm-client-secret',
      }),
    });
    mockInfisicalHttp('NODEMAILER_FROM_INFO', 'no-reply@hashpass.info');

    const { getInfisicalSecret } = require('../../lib/server/infisical-secrets');
    await getInfisicalSecret('NODEMAILER_FROM_INFO');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ SecretId: 'hashpass/expo-router-api-prod/infisical-bootstrap' })
    );
  });

  it('returns undefined without throwing when Secrets Manager has no bootstrap secret', async () => {
    mockSend.mockResolvedValue({ SecretString: undefined });

    const { getInfisicalSecret } = require('../../lib/server/infisical-secrets');
    const value = await getInfisicalSecret('NODEMAILER_FROM_INFO');

    expect(value).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns undefined without throwing when Secrets Manager itself errors', async () => {
    mockSend.mockRejectedValue(new Error('access denied'));

    const { getInfisicalSecret } = require('../../lib/server/infisical-secrets');
    const value = await getInfisicalSecret('NODEMAILER_FROM_INFO');

    expect(value).toBeUndefined();
  });

  it('returns undefined without throwing when the Infisical login call fails', async () => {
    process.env.INFISICAL_DOMAIN = 'https://secrets.example.com';
    process.env.INFISICAL_PROJECT_ID = 'proj-123';
    process.env.INFISICAL_CLIENT_ID = 'client-id';
    process.env.INFISICAL_CLIENT_SECRET = 'example-client-secret';
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' });

    const { getInfisicalSecret } = require('../../lib/server/infisical-secrets');
    const value = await getInfisicalSecret('NODEMAILER_FROM_INFO');

    expect(value).toBeUndefined();
  });

  it('caches secrets for the process lifetime instead of refetching on every call', async () => {
    process.env.INFISICAL_DOMAIN = 'https://secrets.example.com';
    process.env.INFISICAL_PROJECT_ID = 'proj-123';
    process.env.INFISICAL_CLIENT_ID = 'client-id';
    process.env.INFISICAL_CLIENT_SECRET = 'example-client-secret';
    mockInfisicalHttp('NODEMAILER_FROM_INFO', 'no-reply@hashpass.info');

    const { getInfisicalSecret } = require('../../lib/server/infisical-secrets');
    await getInfisicalSecret('NODEMAILER_FROM_INFO');
    await getInfisicalSecret('NODEMAILER_HOST_INFO');

    // Login + secrets fetch = 2 calls total for both getInfisicalSecret calls combined.
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
