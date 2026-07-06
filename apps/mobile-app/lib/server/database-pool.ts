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

const isProductionRuntime = (): boolean =>
  (readEnv('EXPO_PUBLIC_ENV') || readEnv('NODE_ENV') || '').toLowerCase() === 'production';

const getDatabaseConnectionTimeoutMillis = (): number => {
  const configuredTimeout = Number(
    readEnv('BETTER_AUTH_DATABASE_CONNECTION_TIMEOUT_MS') || readEnv('DB_CONNECTION_TIMEOUT_MS')
  );

  return Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 5000;
};

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
  (isProductionRuntime()
    ? readEnv('SUPABASE_DB_URL_PROD') ||
      readEnv('BSL_SUPABASE_DB_URL_PROD') ||
      readEnv('DATABASE_URL_PROD') ||
      readEnv('PROD_DB_URL') ||
      readEnv('PROD_BSL_DB_URL') ||
      readEnv('SUPABASE_DB_URL')
    : readEnv('SUPABASE_DB_URL_DEV') ||
      readEnv('BSL_SUPABASE_DB_URL_DEV') ||
      readEnv('DATABASE_URL_DEV') ||
      readEnv('DEV_DB_URL') ||
      readEnv('DEV_BSL_DB_URL') ||
      readEnv('SUPABASE_DB_URL') ||
      readEnv('SUPABASE_DB_URL_PROD') ||
      readEnv('BSL_SUPABASE_DB_URL_PROD') ||
      readEnv('DATABASE_URL_PROD') ||
      readEnv('PROD_DB_URL') ||
      readEnv('PROD_BSL_DB_URL')) ||
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
      'Better Auth database is not configured. Set BETTER_AUTH_DATABASE_URL, BSL_BETTER_AUTH_DATABASE_URL, BSL_DATABASE_URL, DATABASE_URL, SUPABASE_DB_URL_DEV, SUPABASE_DB_URL, or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD before using /api/auth.'
    );
  }

  pool = new Pool({
    connectionString: connectionString
      ? normalizeDatabaseConnectionString(connectionString)
      : 'postgres://invalid:invalid@localhost:5432/better_auth_missing',
    connectionTimeoutMillis: getDatabaseConnectionTimeoutMillis(),
    ssl: isDatabaseSslDisabled()
      ? false
      : { rejectUnauthorized: shouldRejectUnauthorizedDatabaseSsl() },
  });

  return pool;
};
