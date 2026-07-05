import { Pool } from 'pg';

let pool: Pool | null = null;

const readEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value || undefined;
};

const isTruthyEnv = (value?: string): boolean =>
  ['1', 'true', 'yes', 'on'].includes((value || '').toLowerCase());

const isDatabaseSslDisabled = (): boolean =>
  (readEnv('BETTER_AUTH_DATABASE_SSL') || readEnv('DB_SSL') || '').toLowerCase() === 'false';

const shouldRejectUnauthorizedDatabaseSsl = (): boolean =>
  isTruthyEnv(
    readEnv('BETTER_AUTH_DATABASE_SSL_REJECT_UNAUTHORIZED') ||
      readEnv('DB_SSL_REJECT_UNAUTHORIZED')
  );

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

export const getDatabaseConnectionString = (): string | undefined =>
  readEnv('BETTER_AUTH_DATABASE_URL') ||
  readEnv('BSL_BETTER_AUTH_DATABASE_URL') ||
  readEnv('BSL_DATABASE_URL') ||
  readEnv('DATABASE_URL') ||
  (() => {
    const host = readEnv('DB_HOST');
    const database = readEnv('DB_NAME');
    const user = readEnv('DB_USER');
    const password = readEnv('DB_PASSWORD')?.replace(/^"|"$/g, '');

    if (!host || !database || !user || !password) {
      return undefined;
    }

    const url = new URL('postgresql://localhost');
    url.hostname = host;
    url.port = readEnv('DB_PORT') || '5432';
    url.pathname = `/${database}`;
    url.username = user;
    url.password = password;

    return url.toString();
  })();

export const hasDatabaseConnectionString = (): boolean => Boolean(getDatabaseConnectionString());

export const getDatabasePool = (): Pool => {
  if (pool) return pool;

  const connectionString = getDatabaseConnectionString();

  if (!connectionString) {
    console.warn(
      'Better Auth database is not configured. Set BETTER_AUTH_DATABASE_URL, BSL_BETTER_AUTH_DATABASE_URL, DATABASE_URL, or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD before using /api/auth.'
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
