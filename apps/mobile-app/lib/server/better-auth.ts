import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { ENV_CONFIG, SSO_CONFIG } from '@hashpass/config';
import { syncPublicUserRegistry } from '../auth/public-user-registry';

const normalizeAuthPath = (value?: string | null): string => {
  const trimmed = (value || '/api/auth').trim();
  if (!trimmed) return '/api/auth';
  const normalized = trimmed.startsWith('/') ? trimmed.replace(/\/$/, '') : `/${trimmed.replace(/\/$/, '')}`;
  const legacySegment = ['bsl', 'auth'].join('-');
  return normalized.replace(new RegExp(`/${legacySegment}$`), '/auth');
};

const normalizeAuthURL = (value?: string | null): string | undefined => {
  const trimmed = (value || '').trim();
  if (!trimmed) return undefined;
  const legacySegment = ['bsl', 'auth'].join('-');
  return trimmed.replace(/\/$/, '').replace(new RegExp(`/${legacySegment}$`), '/auth');
};

const AUTH_BASE_PATH = normalizeAuthPath(process.env.BETTER_AUTH_BASE_PATH || '/api/auth');
const DEFAULT_ALLOWED_HOSTS = Array.from(
  new Set([
    'localhost',
    '127.0.0.1',
    'api.hashpass.tech',
    'api-dev.hashpass.tech',
    ...Object.values(SSO_CONFIG.tenants).flatMap((tenant) => [
      tenant.domain,
      ...(tenant.hostnames || []),
    ]),
  ])
);
const DEFAULT_TRUSTED_ORIGINS = SSO_CONFIG.cors.origins;

let pool: Pool | null = null;

const readEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value || undefined;
};

const readListEnv = (name: string): string[] =>
  (readEnv(name) || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const isTruthyEnv = (value?: string): boolean =>
  ['1', 'true', 'yes', 'on'].includes((value || '').toLowerCase());

const isDatabaseSslDisabled = (): boolean =>
  (readEnv('BETTER_AUTH_DATABASE_SSL') || '').toLowerCase() === 'false';

const shouldRejectUnauthorizedDatabaseSsl = (): boolean =>
  isTruthyEnv(readEnv('BETTER_AUTH_DATABASE_SSL_REJECT_UNAUTHORIZED'));

const normalizeDatabaseConnectionString = (connectionString: string): string => {
  if (isDatabaseSslDisabled() || shouldRejectUnauthorizedDatabaseSsl()) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode')?.toLowerCase();

    if (!sslMode || ['prefer', 'require', 'verify-ca', 'verify-full'].includes(sslMode)) {
      url.searchParams.set('sslmode', 'no-verify');
    }

    return url.toString();
  } catch {
    return connectionString;
  }
};

export const getDatabasePool = (): Pool => {
  if (pool) return pool;

  const connectionString =
    readEnv('BETTER_AUTH_DATABASE_URL') ||
    readEnv('BSL_BETTER_AUTH_DATABASE_URL') ||
    readEnv('BSL_DATABASE_URL') ||
    readEnv('DATABASE_URL');

  if (!connectionString) {
    console.warn(
      'Better Auth database is not configured. Set BETTER_AUTH_DATABASE_URL or BSL_BETTER_AUTH_DATABASE_URL before using /api/auth.'
    );
  }

  pool = new Pool({
    connectionString: connectionString
      ? normalizeDatabaseConnectionString(connectionString)
      : 'postgres://invalid:invalid@localhost:5432/better_auth_missing',
    ssl: isDatabaseSslDisabled()
      ? false
      : { rejectUnauthorized: shouldRejectUnauthorizedDatabaseSsl() },
  });

  return pool;
};

const splitName = (name?: string | null) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const [firstName, ...rest] = trimmed.split(/\s+/);
  return { firstName, lastName: rest.join(' ') || null };
};

const resolveRequestHostname = (request?: Request): string => {
  if (!(request instanceof Request)) {
    return '';
  }

  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  if (origin) {
    try {
      return new URL(origin).hostname.toLowerCase();
    } catch {
      // Fall through to forwarded/host headers.
    }
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    try {
      return new URL(`https://${forwardedHost.split(',')[0].trim()}`).hostname.toLowerCase();
    } catch {
      return forwardedHost.split(',')[0].trim().toLowerCase();
    }
  }

  const host = request.headers.get('host');
  if (host) {
    return host.split(',')[0].trim().toLowerCase();
  }

  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const resolveRequestTenant = (request?: Request) => {
  const hostname = resolveRequestHostname(request);
  return ENV_CONFIG.getTenant(hostname);
};

const syncBetterAuthUser = async (user: Record<string, any>, context: any) => {
  const request = context?.request || context?.context?.request;
  if (!(request instanceof Request)) return;
  const tenant = resolveRequestTenant(request);

  const { firstName, lastName } = splitName(user.name);

  await syncPublicUserRegistry(request, {
    provider: 'better-auth',
    authUserId: user.id,
    email: user.email,
    firstName,
    lastName,
    fullName: user.name || null,
    avatarUrl: user.image || null,
    role: user.role || 'user',
    status: user.banned ? 'banned' : 'active',
    emailVerifiedAt: user.emailVerified ? new Date().toISOString() : null,
    authMetadata: {
      auth_provider: 'better-auth',
      tenant: tenant.slug,
      tenant_domain: tenant.domain,
    },
    profileMetadata: {
      better_auth_user: user,
    },
    providerIds: {
      'better-auth': user.id,
    },
  });
};

const googleClientId = readEnv('BETTER_AUTH_GOOGLE_CLIENT_ID') || readEnv('GOOGLE_CLIENT_ID');
const googleClientSecret =
  readEnv('BETTER_AUTH_GOOGLE_CLIENT_SECRET') || readEnv('GOOGLE_CLIENT_SECRET');
const configuredBaseURL = normalizeAuthURL(readEnv('BETTER_AUTH_URL'));

export const auth = betterAuth({
  appName: 'HashPass Auth',
  basePath: AUTH_BASE_PATH,
  ...(configuredBaseURL
    ? { baseURL: configuredBaseURL }
    : {
        baseURL: {
          allowedHosts: [...DEFAULT_ALLOWED_HOSTS, ...readListEnv('BETTER_AUTH_ALLOWED_HOSTS')],
        },
      }),
  database: getDatabasePool(),
  trustedOrigins: [
    ...DEFAULT_TRUSTED_ORIGINS,
    ...readListEnv('BETTER_AUTH_TRUSTED_ORIGINS'),
  ],
  socialProviders: {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {}),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user, context) => {
          await syncBetterAuthUser(user, context);
        },
      },
      update: {
        after: async (user, context) => {
          await syncBetterAuthUser(user, context);
        },
      },
    },
  },
});
