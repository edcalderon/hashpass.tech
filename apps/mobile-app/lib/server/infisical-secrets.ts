import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/**
 * Runtime fetch layer for the "less critical" secret tier of the hybrid
 * secrets policy: vital secrets (DB URLs, service-role keys, OAuth
 * secrets, ...) stay as raw Lambda environment variables as before; new,
 * non-critical secrets go into Infisical instead and get pulled in here at
 * runtime, so they never count against Lambda's 4KB environment variable
 * ceiling.
 *
 * The bootstrap credentials needed to reach Infisical itself (a Universal
 * Auth machine identity) hit the exact same ceiling -- both Lambdas were
 * already at/over the real 4KB limit before adding anything (confirmed via
 * RequestEntityTooLargeException on a sync of just 4 small keys), so those
 * live in AWS Secrets Manager instead (hashpass/expo-router-api-<env>/
 * infisical-bootstrap), fetched via the Lambda's own IAM execution role --
 * that data is entirely outside the env var budget. Locally, plain
 * INFISICAL_* env vars are used directly instead (no AWS credentials
 * needed for local dev).
 */

const SECRETS_MANAGER_REGION = (process.env.AWS_REGION || 'us-east-1').trim();

const secretsManagerClient = new SecretsManagerClient({
  region: SECRETS_MANAGER_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

interface BootstrapCredentials {
  domain: string;
  projectId: string;
  clientId: string;
  clientSecret: string;
}

function resolveEnvironmentSlug(): string {
  return process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
}

function bootstrapSecretName(): string {
  return `hashpass/expo-router-api-${resolveEnvironmentSlug()}/infisical-bootstrap`;
}

let cachedBootstrap: BootstrapCredentials | null | undefined;

async function getBootstrapCredentials(): Promise<BootstrapCredentials | null> {
  if (cachedBootstrap !== undefined) return cachedBootstrap;

  // Local dev: plain env vars, no AWS round trip needed.
  const envDomain = process.env.INFISICAL_DOMAIN;
  const envProjectId = process.env.INFISICAL_PROJECT_ID;
  const envClientId = process.env.INFISICAL_CLIENT_ID;
  const envClientSecret = process.env.INFISICAL_CLIENT_SECRET;
  if (envProjectId && envClientId && envClientSecret) {
    cachedBootstrap = {
      domain: envDomain || 'https://secrets.cig.technology',
      projectId: envProjectId,
      clientId: envClientId,
      clientSecret: envClientSecret,
    };
    return cachedBootstrap;
  }

  try {
    const response = await secretsManagerClient.send(
      new GetSecretValueCommand({ SecretId: bootstrapSecretName() })
    );
    if (!response.SecretString) {
      cachedBootstrap = null;
      return null;
    }
    const parsed = JSON.parse(response.SecretString);
    if (!parsed?.projectId || !parsed?.clientId || !parsed?.clientSecret) {
      cachedBootstrap = null;
      return null;
    }
    cachedBootstrap = {
      domain: parsed.domain || 'https://secrets.cig.technology',
      projectId: parsed.projectId,
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
    };
    return cachedBootstrap;
  } catch (error) {
    console.error('[infisical] Secrets Manager fetch failed:', error instanceof Error ? error.message : String(error));
    cachedBootstrap = null;
    return null;
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(bootstrap: BootstrapCredentials): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  try {
    const body = new URLSearchParams({
      clientId: bootstrap.clientId,
      clientSecret: bootstrap.clientSecret,
    });
    const response = await fetch(`${bootstrap.domain}/api/v1/auth/universal-auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) {
      console.error('[infisical] universal-auth login failed:', response.status);
      return null;
    }
    const data = await response.json();
    if (!data?.accessToken) return null;
    cachedToken = {
      token: data.accessToken,
      expiresAt: Date.now() + (Number(data.expiresIn) || 7_200) * 1000,
    };
    return cachedToken.token;
  } catch (error) {
    console.error('[infisical] universal-auth login error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

interface CachedSecrets {
  values: Record<string, string>;
  fetchedAt: number;
}

// Cached per Lambda execution context (reused across warm invocations) with
// a short TTL so a secret rotated in Infisical still propagates without
// requiring a redeploy.
const secretsCacheByEnvironment = new Map<string, CachedSecrets>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchAllSecrets(): Promise<Record<string, string>> {
  const environment = resolveEnvironmentSlug();
  const cached = secretsCacheByEnvironment.get(environment);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.values;
  }

  const bootstrap = await getBootstrapCredentials();
  if (!bootstrap) return cached?.values || {};

  const token = await getAccessToken(bootstrap);
  if (!token) return cached?.values || {};

  try {
    const url = `${bootstrap.domain}/api/v4/secrets?projectId=${encodeURIComponent(bootstrap.projectId)}&environment=${encodeURIComponent(environment)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      console.error('[infisical] secrets fetch failed:', response.status);
      return cached?.values || {};
    }
    const data = await response.json();
    const values: Record<string, string> = {};
    for (const secret of data?.secrets || []) {
      if (secret?.secretKey) values[secret.secretKey] = secret.secretValue ?? '';
    }
    secretsCacheByEnvironment.set(environment, { values, fetchedAt: Date.now() });
    return values;
  } catch (error) {
    console.error('[infisical] secrets fetch error:', error instanceof Error ? error.message : String(error));
    return cached?.values || {};
  }
}

/** Returns undefined (never throws) if Infisical isn't configured or the key isn't found. */
export async function getInfisicalSecret(key: string): Promise<string | undefined> {
  const secrets = await fetchAllSecrets();
  return secrets[key];
}
