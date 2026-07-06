import { createRequire } from 'module';
import { loadServerEnvFiles } from './load-server-env';
import {
  getDatabaseConnectionString as getRawDatabaseConnectionString,
  getNormalizedDatabaseConnectionString,
} from './database-config';

type PgModule = typeof import('pg');
type Pool = InstanceType<PgModule['Pool']>;

let pool: Pool | null = null;
const nodeRequire = createRequire(__filename);

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

const getDatabaseConnectionTimeoutMillis = (): number => {
  const configuredTimeout = Number(
    readEnv('BETTER_AUTH_DATABASE_CONNECTION_TIMEOUT_MS') || readEnv('DB_CONNECTION_TIMEOUT_MS')
  );

  return Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 5000;
};

export const getDatabaseConnectionString = (): string | undefined => {
  loadServerEnvFiles();
  return getRawDatabaseConnectionString();
};

export const hasDatabaseConnectionString = (): boolean => Boolean(getDatabaseConnectionString());

export const getDatabasePool = (): Pool => {
  loadServerEnvFiles();

  if (pool) return pool;

  const connectionString = getDatabaseConnectionString();

  if (!connectionString) {
    console.warn(
      'Better Auth database is not configured. Set BETTER_AUTH_DATABASE_URL, BSL_BETTER_AUTH_DATABASE_URL, BSL_DATABASE_URL, DATABASE_URL, SUPABASE_DB_URL_DEV, SUPABASE_DB_URL, or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD before using /api/auth.'
    );
  }

  const { Pool: PgPool } = nodeRequire('pg') as PgModule;

  pool = new PgPool({
    connectionString: connectionString
      ? getNormalizedDatabaseConnectionString(connectionString)
      : 'postgres://invalid:invalid@localhost:5432/better_auth_missing',
    connectionTimeoutMillis: getDatabaseConnectionTimeoutMillis(),
    ssl: isDatabaseSslDisabled()
      ? false
      : { rejectUnauthorized: shouldRejectUnauthorizedDatabaseSsl() },
  });

  return pool;
};
