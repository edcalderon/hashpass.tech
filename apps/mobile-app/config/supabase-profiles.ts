export type SupabaseProfileId =
  | 'core-development'
  | 'core-production'
  | 'bsl-development'
  | 'bsl-production';

type EnvReader = (name: string) => string | undefined;

type BrowserRuntimeConfig = {
  apiBaseUrl?: string;
  betterAuthUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseProfiles?: Partial<Record<SupabaseProfileId, BrowserSupabaseProfileConfig>>;
};

type BrowserSupabaseProfileConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

type SupabaseProfile = {
  id: SupabaseProfileId;
  tenant: 'core' | 'bsl';
  environment: 'development' | 'production';
  hosts: string[];
  publicUrlEnv: string[];
  publicKeyEnv: string[];
  serviceRoleEnv: string[];
  dbUrlEnv: string[];
};

export type PublicSupabaseConfig = {
  profileId: SupabaseProfileId;
  tenant: SupabaseProfile['tenant'];
  environment: SupabaseProfile['environment'];
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export type ServerSupabaseConfig = PublicSupabaseConfig & {
  supabaseServiceKey?: string;
  databaseUrl?: string;
  usingFallback: boolean;
};

const PROFILES: SupabaseProfile[] = [
  {
    id: 'core-development',
    tenant: 'core',
    environment: 'development',
    hosts: ['localhost', '127.0.0.1'],
    publicUrlEnv: [
      'EXPO_PUBLIC_SUPABASE_URL_DEV',
      'NEXT_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_URL',
    ],
    publicKeyEnv: [
      'EXPO_PUBLIC_SUPABASE_KEY_DEV',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_SUPABASE_KEY',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ],
    serviceRoleEnv: ['SUPABASE_SERVICE_ROLE_KEY_DEV', 'SUPABASE_SERVICE_ROLE_KEY'],
    dbUrlEnv: ['SUPABASE_DB_URL_DEV', 'DATABASE_URL_DEV', 'DEV_DB_URL'],
  },
  {
    id: 'core-production',
    tenant: 'core',
    environment: 'production',
    hosts: ['hashpass.tech', 'www.hashpass.tech'],
    publicUrlEnv: [
      'EXPO_PUBLIC_SUPABASE_URL_PROD',
      'NEXT_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_URL',
    ],
    publicKeyEnv: [
      'EXPO_PUBLIC_SUPABASE_KEY_PROD',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_SUPABASE_KEY',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ],
    serviceRoleEnv: ['SUPABASE_SERVICE_ROLE_KEY_PROD', 'SUPABASE_SERVICE_ROLE_KEY'],
    dbUrlEnv: ['SUPABASE_DB_URL_PROD', 'DATABASE_URL_PROD', 'PROD_DB_URL'],
  },
  {
    id: 'bsl-development',
    tenant: 'bsl',
    environment: 'development',
    hosts: ['bsl-dev.hashpass.tech'],
    publicUrlEnv: [
      'EXPO_PUBLIC_BSL_SUPABASE_URL_DEV',
      'EXPO_PUBLIC_SUPABASE_URL_BSL_DEV',
      'EXPO_PUBLIC_BSL_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_URL_DEV',
      'EXPO_PUBLIC_SUPABASE_URL',
    ],
    publicKeyEnv: [
      'EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV',
      'EXPO_PUBLIC_SUPABASE_KEY_BSL_DEV',
      'EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_DEV',
      'EXPO_PUBLIC_BSL_SUPABASE_KEY',
      'EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_SUPABASE_KEY_DEV',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV',
      'EXPO_PUBLIC_SUPABASE_KEY',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ],
    serviceRoleEnv: [
      'BSL_SUPABASE_SERVICE_ROLE_KEY_DEV',
      'SUPABASE_SERVICE_ROLE_KEY_BSL_DEV',
      'BSL_SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY_DEV',
    ],
    dbUrlEnv: [
      'BSL_SUPABASE_DB_URL_DEV',
      'SUPABASE_DB_URL_BSL_DEV',
      'DATABASE_URL_BSL_DEV',
      'DEV_BSL_DB_URL',
    ],
  },
  {
    id: 'bsl-production',
    tenant: 'bsl',
    environment: 'production',
    hosts: ['bsl.hashpass.tech'],
    publicUrlEnv: [
      'EXPO_PUBLIC_BSL_SUPABASE_URL_PROD',
      'EXPO_PUBLIC_SUPABASE_URL_BSL_PROD',
      'EXPO_PUBLIC_BSL_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_URL_PROD',
      'EXPO_PUBLIC_SUPABASE_URL',
    ],
    publicKeyEnv: [
      'EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD',
      'EXPO_PUBLIC_SUPABASE_KEY_BSL_PROD',
      'EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_PROD',
      'EXPO_PUBLIC_BSL_SUPABASE_KEY',
      'EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_SUPABASE_KEY_PROD',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD',
      'EXPO_PUBLIC_SUPABASE_KEY',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ],
    serviceRoleEnv: [
      'BSL_SUPABASE_SERVICE_ROLE_KEY_PROD',
      'SUPABASE_SERVICE_ROLE_KEY_BSL_PROD',
      'BSL_SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY_PROD',
    ],
    dbUrlEnv: [
      'BSL_SUPABASE_DB_URL_PROD',
      'SUPABASE_DB_URL_BSL_PROD',
      'DATABASE_URL_BSL_PROD',
      'PROD_BSL_DB_URL',
    ],
  },
];

const readProcessEnv: EnvReader = (name) => {
  if (typeof process === 'undefined') return undefined;
  return process.env?.[name];
};

const normalizeEnvValue = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const readBrowserRuntimeConfig = (): BrowserRuntimeConfig | undefined => {
  if (typeof globalThis === 'undefined') return undefined;

  const runtime = (globalThis as Record<string, unknown>).__HASHPASS_RUNTIME__;
  if (!runtime || typeof runtime !== 'object') return undefined;

  return runtime as BrowserRuntimeConfig;
};

const readRuntimeProfileConfig = (profileId?: SupabaseProfileId): BrowserSupabaseProfileConfig | undefined => {
  const runtime = readBrowserRuntimeConfig();
  if (!runtime || !profileId) return undefined;

  const profile = runtime.supabaseProfiles?.[profileId];
  if (!profile || typeof profile !== 'object') return undefined;

  return profile;
};

const readRuntimeGlobal = (name: string, profileId?: SupabaseProfileId): string | undefined => {
  const runtime = readBrowserRuntimeConfig();
  if (!runtime || !name.includes('PUBLIC')) return undefined;

  const runtimeProfile = readRuntimeProfileConfig(profileId);

  if (name.includes('URL')) {
    return normalizeEnvValue(runtimeProfile?.supabaseUrl) || normalizeEnvValue(runtime.supabaseUrl);
  }

  if (name.includes('KEY')) {
    return normalizeEnvValue(runtimeProfile?.supabaseAnonKey) || normalizeEnvValue(runtime.supabaseAnonKey);
  }

  return undefined;
};

const firstEnv = (names: string[], readEnv: EnvReader = readProcessEnv, profileId?: SupabaseProfileId) => {
  for (const name of names) {
    const value = normalizeEnvValue(readEnv(name)) || readRuntimeGlobal(name, profileId);
    if (value) return value;
  }

  return undefined;
};

export const normalizeHostname = (value?: string | null): string => {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return '';

  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return raw.split('/')[0].split(':')[0].toLowerCase();
  }
};

export const hostnameFromRequest = (request: Request): string => {
  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  if (origin) return normalizeHostname(origin);

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) return normalizeHostname(forwardedHost);

  const host = request.headers.get('host');
  if (host) return normalizeHostname(host);

  return normalizeHostname(request.url);
};

const runtimeHostname = (hostname?: string) => {
  if (hostname) return normalizeHostname(hostname);

  if (typeof window !== 'undefined') {
    return normalizeHostname(window.location.hostname);
  }

  return normalizeHostname(
    readProcessEnv('EXPO_PUBLIC_SITE_URL') ||
      readProcessEnv('SITE_URL') ||
      readProcessEnv('FRONTEND_URL') ||
      ''
  );
};

const profileById = (profileId?: string | null): SupabaseProfile | undefined =>
  PROFILES.find((profile) => profile.id === profileId);

export const resolveSupabaseProfile = (input?: {
  hostname?: string;
  profileId?: string | null;
}): SupabaseProfile => {
  const explicitProfile =
    profileById(input?.profileId) ||
    profileById(readProcessEnv('EXPO_PUBLIC_SUPABASE_PROFILE')) ||
    profileById(readProcessEnv('SUPABASE_PROFILE'));

  if (explicitProfile) return explicitProfile;

  const host = runtimeHostname(input?.hostname);
  const matched = PROFILES.find((profile) => profile.hosts.includes(host));
  if (matched) return matched;

  return host.includes('bsl') ? profileById('bsl-production')! : profileById('core-production')!;
};

export const resolvePublicSupabaseConfig = (input?: {
  hostname?: string;
  profileId?: string | null;
  readEnv?: EnvReader;
}): PublicSupabaseConfig => {
  const profile = resolveSupabaseProfile(input);
  const readEnv = input?.readEnv || readProcessEnv;

  return {
    profileId: profile.id,
    tenant: profile.tenant,
    environment: profile.environment,
    supabaseUrl: firstEnv(profile.publicUrlEnv, readEnv, profile.id),
    supabaseAnonKey: firstEnv(profile.publicKeyEnv, readEnv, profile.id),
  };
};

export const resolveServerSupabaseConfig = (input?: {
  hostname?: string;
  profileId?: string | null;
  readEnv?: EnvReader;
}): ServerSupabaseConfig => {
  const profile = resolveSupabaseProfile(input);
  const readEnv = input?.readEnv || readProcessEnv;
  const publicConfig = resolvePublicSupabaseConfig({
    hostname: input?.hostname,
    profileId: profile.id,
    readEnv,
  });
  const supabaseServiceKey = firstEnv(profile.serviceRoleEnv, readEnv);

  return {
    ...publicConfig,
    supabaseServiceKey,
    databaseUrl: firstEnv(profile.dbUrlEnv, readEnv),
    usingFallback: !firstEnv([profile.publicUrlEnv[0], profile.serviceRoleEnv[0]], readEnv),
  };
};

export const SUPABASE_PROFILES = PROFILES;
