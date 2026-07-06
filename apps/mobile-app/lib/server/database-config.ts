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

const getPreferredSupabasePoolerHost = (): string =>
  isProductionRuntime()
    ? 'aws-1-us-west-2.pooler.supabase.com'
    : 'aws-0-us-east-2.pooler.supabase.com';

const convertDirectSupabaseUrlToPooler = (connectionString: string): string => {
  try {
    const url = new URL(connectionString);
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes('pooler.supabase.com')) {
      return connectionString;
    }

    const match = hostname.match(/^db\.([^.]+)\.supabase\.co$/);
    if (!match) {
      return connectionString;
    }

    const projectRef = match[1];
    const password = url.password;
    const database = url.pathname.replace(/^\//, '') || 'postgres';
    const port = url.port || '5432';
    const search = url.search || '';
    const poolerUsername = `postgres.${projectRef}`;

    return `postgresql://${encodeURIComponent(poolerUsername)}:${encodeURIComponent(password)}@${getPreferredSupabasePoolerHost()}:${port}/${encodeURIComponent(database)}${search}`;
  } catch {
    return connectionString;
  }
};

const normalizeSupabaseDatabaseUrl = (connectionString?: string): string | undefined => {
  if (!connectionString) {
    return undefined;
  }

  return convertDirectSupabaseUrlToPooler(connectionString);
};

const buildDatabaseConnectionStringFromDbEnv = (): string | undefined => {
  const host = readEnv('DB_HOST');
  const database = readEnv('DB_NAME');
  const user = readEnv('DB_USER');
  const password = readEnv('DB_PASSWORD')?.replace(/^"|"$/g, '');

  if (!host || !database || !user || !password) {
    return undefined;
  }

  const port = readEnv('DB_PORT') || '5432';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
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

export const getDatabaseConnectionString = (): string | undefined => {
  const devSupabaseConnectionString =
    normalizeSupabaseDatabaseUrl(readEnv('SUPABASE_DB_URL_DEV')) ||
    normalizeSupabaseDatabaseUrl(readEnv('BSL_SUPABASE_DB_URL_DEV')) ||
    normalizeSupabaseDatabaseUrl(readEnv('DATABASE_URL_DEV')) ||
    normalizeSupabaseDatabaseUrl(readEnv('DEV_DB_URL')) ||
    normalizeSupabaseDatabaseUrl(readEnv('DEV_BSL_DB_URL'));

  const prodSupabaseConnectionString =
    normalizeSupabaseDatabaseUrl(readEnv('SUPABASE_DB_URL_PROD')) ||
    normalizeSupabaseDatabaseUrl(readEnv('BSL_SUPABASE_DB_URL_PROD')) ||
    normalizeSupabaseDatabaseUrl(readEnv('DATABASE_URL_PROD')) ||
    normalizeSupabaseDatabaseUrl(readEnv('PROD_DB_URL')) ||
    normalizeSupabaseDatabaseUrl(readEnv('PROD_BSL_DB_URL'));

  const dbConnectionString = buildDatabaseConnectionStringFromDbEnv();

  return (
    readEnv('BETTER_AUTH_DATABASE_URL') ||
    readEnv('BSL_BETTER_AUTH_DATABASE_URL') ||
    readEnv('BSL_DATABASE_URL') ||
    readEnv('DATABASE_URL') ||
    (isProductionRuntime()
      ? prodSupabaseConnectionString || normalizeSupabaseDatabaseUrl(readEnv('SUPABASE_DB_URL'))
      : devSupabaseConnectionString ||
        normalizeSupabaseDatabaseUrl(readEnv('SUPABASE_DB_URL')) ||
        prodSupabaseConnectionString) ||
    dbConnectionString
  );
};

export const hasDatabaseConnectionString = (): boolean => Boolean(getDatabaseConnectionString());

export const getNormalizedDatabaseConnectionString = (
  connectionString: string
): string => normalizeDatabaseConnectionString(connectionString);
