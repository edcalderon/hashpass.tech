import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { syncPublicUserRegistry } from '../auth/public-user-registry';

const BSL_AUTH_BASE_PATH = process.env.BETTER_AUTH_BASE_PATH || '/api/bsl-auth';
const DEFAULT_ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  'api.hashpass.tech',
  'api-dev.hashpass.tech',
  'bsl.hashpass.tech',
  'bsl-dev.hashpass.tech',
];
const DEFAULT_TRUSTED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:8081',
  'https://api.hashpass.tech',
  'https://api-dev.hashpass.tech',
  'https://bsl.hashpass.tech',
  'https://bsl-dev.hashpass.tech',
];

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

const getDatabasePool = (): Pool => {
  if (pool) return pool;

  const connectionString =
    readEnv('BETTER_AUTH_DATABASE_URL') ||
    readEnv('BSL_BETTER_AUTH_DATABASE_URL') ||
    readEnv('BSL_DATABASE_URL') ||
    readEnv('DATABASE_URL');

  if (!connectionString) {
    console.warn(
      'Better Auth database is not configured. Set BETTER_AUTH_DATABASE_URL or BSL_BETTER_AUTH_DATABASE_URL before using /api/bsl-auth.'
    );
  }

  pool = new Pool({
    connectionString: connectionString || 'postgres://invalid:invalid@localhost:5432/better_auth_missing',
    ssl:
      (readEnv('BETTER_AUTH_DATABASE_SSL') || '').toLowerCase() === 'false'
        ? false
        : { rejectUnauthorized: false },
  });

  return pool;
};

const splitName = (name?: string | null) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const [firstName, ...rest] = trimmed.split(/\s+/);
  return { firstName, lastName: rest.join(' ') || null };
};

const syncBetterAuthUser = async (user: Record<string, any>, context: any) => {
  const request = context?.request || context?.context?.request;
  if (!(request instanceof Request)) return;

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
      tenant: 'bsl',
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
const configuredBaseURL = readEnv('BETTER_AUTH_URL');

export const auth = betterAuth({
  appName: 'HashPass BSL',
  basePath: BSL_AUTH_BASE_PATH,
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
