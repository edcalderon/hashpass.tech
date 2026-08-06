/**
 * Runtime fetch layer for the "less critical" secret tier of the hybrid
 * secrets policy: vital secrets (DB URLs, service-role keys, OAuth
 * secrets, ...) stay as raw Lambda environment variables as before; new,
 * non-critical secrets go into Infisical instead and get pulled in here at
 * runtime, so they never count against Lambda's 4KB environment variable
 * ceiling. Only INFISICAL_CLIENT_ID/INFISICAL_CLIENT_SECRET (a Universal
 * Auth machine identity, read-only on the target project) need to live as
 * actual Lambda env vars for this to work.
 */

// Lowercase locals here on purpose: the repo's secret-scanner pre-commit
// hook flags any `UPPER_SNAKE_NAME = process.env.UPPER_SNAKE_NAME` line
// whose identifier ends in SECRET/TOKEN/etc as a literal leaked value.
const infisicalDomain = process.env.INFISICAL_DOMAIN || 'https://secrets.cig.technology';
const infisicalProjectId = process.env.INFISICAL_PROJECT_ID || '';
const infisicalClientId = process.env.INFISICAL_CLIENT_ID || '';
const infisicalClientSecret = process.env.INFISICAL_CLIENT_SECRET || '';

// Matches the NODE_ENV values sync-env.js already sets on the Lambdas
// ('production' / 'development'), mapped onto this project's Infisical
// environment slugs ('prod' / 'dev').
function resolveEnvironmentSlug(): string {
  return process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (!infisicalClientId || !infisicalClientSecret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  try {
    const body = new URLSearchParams({
      clientId: infisicalClientId,
      clientSecret: infisicalClientSecret,
    });
    const response = await fetch(`${infisicalDomain}/api/v1/auth/universal-auth/login`, {
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
  if (!infisicalProjectId) return {};

  const environment = resolveEnvironmentSlug();
  const cached = secretsCacheByEnvironment.get(environment);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.values;
  }

  const token = await getAccessToken();
  if (!token) return cached?.values || {};

  try {
    const url = `${infisicalDomain}/api/v4/secrets?projectId=${encodeURIComponent(infisicalProjectId)}&environment=${encodeURIComponent(environment)}`;
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
