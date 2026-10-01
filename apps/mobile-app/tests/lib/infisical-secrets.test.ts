/// <reference types="jest" />

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => input),
}));

const ENV_KEYS = [
  'INFISICAL_DOMAIN',
  'INFISICAL_PROJECT_ID',
  'INFISICAL_CLIENT_ID',
  'INFISICAL_CLIENT_SECRET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_REGION',
  'AWS_LAMBDA_FUNCTION_NAME',
  'NODE_ENV',
];

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

  it('does not create an AWS Secrets Manager client when the module is imported', () => {
    const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');

    require('../../lib/server/infisical-secrets');

    expect(SecretsManagerClient).not.toHaveBeenCalled();
  });

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

  it('uses the development secret name in a dev Lambda even though NODE_ENV is production', async () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      AWS_LAMBDA_FUNCTION_NAME: 'hashpass-dev-expo-router-api',
    });
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({ BETTER_AUTH_APPLE_CLIENT_ID: 'com.example.signin' }),
    });

    const { getAppleSignInSecret } = require('../../lib/server/infisical-secrets');
    await getAppleSignInSecret('BETTER_AUTH_APPLE_CLIENT_ID');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ SecretId: 'hashpass/expo-router-api-dev/apple-sign-in' })
    );
  });

  it('reads the dedicated Apple provider secret from Secrets Manager without using Infisical', async () => {
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({
        BETTER_AUTH_APPLE_CLIENT_ID: 'com.example.signin',
      }),
    });

    const { getAppleSignInSecret } = require('../../lib/server/infisical-secrets');
    await expect(getAppleSignInSecret('BETTER_AUTH_APPLE_CLIENT_ID')).resolves.toBe('com.example.signin');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ SecretId: 'hashpass/expo-router-api-dev/apple-sign-in' })
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uses the production Apple secret for a production Lambda function', async () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      AWS_LAMBDA_FUNCTION_NAME: 'hashpass-prod-expo-router-api',
    });
    mockSend.mockResolvedValue({ SecretString: JSON.stringify({}) });

    const { getAppleSignInSecret } = require('../../lib/server/infisical-secrets');
    await expect(getAppleSignInSecret('BETTER_AUTH_APPLE_CLIENT_ID')).resolves.toBeUndefined();

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ SecretId: 'hashpass/expo-router-api-prod/apple-sign-in' })
    );
  });

  it('treats an empty Apple secret record as unavailable', async () => {
    mockSend.mockResolvedValue({ SecretString: undefined });

    const { getAppleSignInSecret } = require('../../lib/server/infisical-secrets');
    await expect(getAppleSignInSecret('BETTER_AUTH_APPLE_CLIENT_ID')).resolves.toBeUndefined();
  });

  it('keeps Apple sign-in unavailable after a Secrets Manager failure instead of retrying per field', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSend.mockRejectedValue(new Error('access denied'));

    const { getAppleSignInSecret } = require('../../lib/server/infisical-secrets');
    await expect(getAppleSignInSecret('BETTER_AUTH_APPLE_CLIENT_ID')).resolves.toBeUndefined();
    await expect(getAppleSignInSecret('BETTER_AUTH_APPLE_TEAM_ID')).resolves.toBeUndefined();

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      '[apple-sign-in] Secrets Manager fetch failed:',
      'access denied'
    );
    consoleError.mockRestore();
  });

  it('logs a non-Error Apple secret failure without throwing', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSend.mockRejectedValue('request cancelled');

    const { getAppleSignInSecret } = require('../../lib/server/infisical-secrets');
    await expect(getAppleSignInSecret('BETTER_AUTH_APPLE_CLIENT_ID')).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      '[apple-sign-in] Secrets Manager fetch failed:',
      'request cancelled'
    );
    consoleError.mockRestore();
  });

  it('uses the AWS default credential chain when temporary Lambda credentials are present', async () => {
    process.env.AWS_ACCESS_KEY_ID = '<test-aws-access-key>';
    process.env.AWS_SECRET_ACCESS_KEY = '<test-aws-secret-key>';
    process.env.AWS_SESSION_TOKEN = '<test-aws-session-token>';
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({ BETTER_AUTH_APPLE_CLIENT_ID: 'com.example.signin' }),
    });

    const { getAppleSignInSecret } = require('../../lib/server/infisical-secrets');
    await expect(getAppleSignInSecret('BETTER_AUTH_APPLE_CLIENT_ID')).resolves.toBe('com.example.signin');

    const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
    expect(SecretsManagerClient).toHaveBeenCalledWith({ region: 'us-east-1' });
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

  it('briefly caches a failed Infisical login instead of retrying each secret lookup', async () => {
    process.env.INFISICAL_DOMAIN = 'https://secrets.example.com';
    process.env.INFISICAL_PROJECT_ID = 'proj-123';
    process.env.INFISICAL_CLIENT_ID = 'client-id';
    process.env.INFISICAL_CLIENT_SECRET = '<test-invalid-credential>';
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' });

    const { getInfisicalSecret } = require('../../lib/server/infisical-secrets');
    await getInfisicalSecret('BETTER_AUTH_APPLE_CLIENT_ID');
    await getInfisicalSecret('BETTER_AUTH_APPLE_TEAM_ID');

    expect(global.fetch).toHaveBeenCalledTimes(1);
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
