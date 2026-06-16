// SSO Configuration for HashPass using Directus
// This replaces the old Supabase configuration

// ===========================================
// Directus SSO Configuration
// ===========================================
export const SSO_CONFIG = {
  // Main SSO endpoint - Directus instance
  SSO_URL: 'https://sso.hashpass.co',

  // API endpoints
  endpoints: {
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    me: '/users/me',
    users: '/users',
  },

  // Token storage keys
  storage: {
    session: 'directus_session',
    accessToken: 'directus_access_token',
    refreshToken: 'directus_refresh_token',
  },

  // OAuth providers (if needed in future)
  oauth: {
    redirectUrl: 'https://sso.hashpass.co/auth/callback',
    providers: ['google', 'github'], // Future OAuth providers
  },

  // CORS settings
  cors: {
    origins: [
      'https://hashpass.co',
      'https://www.hashpass.co',
      'https://bsl2025.hashpass.co',
      'https://bsl2025.hashpass.tech',
      'https://bsl.hashpass.tech',
      'https://bsl-dev.hashpass.tech',
      'https://peru2026.hashpass.tech',
      'https://chile2026.hashpass.tech',
      'https://colombia2026.hashpass.tech',
      'https://blockchainsummit.hashpass.lat',
      'https://blockchainsummit-dev.hashpass.lat',
      'https://api.hashpass.tech',
      'https://api-dev.hashpass.tech',
      'https://sso-dev.hashpass.co',
      'http://localhost:19006',
      'http://127.0.0.1:8081',
      'http://localhost:8081',
      'http://localhost:3000',
    ],
  },

  // Tenant Configuration Mappings
  tenants: {
    'bsl-2025': {
      id: 'bsl-2025',
      name: 'Blockchain Summit Latam 2025',
      domain: 'blockchainsummit.hashpass.lat',
      hostnames: [
        'bsl2025.hashpass.tech',
        'bsl2025.hashpass.co',
        'blockchainsummit-dev.hashpass.lat',
      ],
      slug: 'bsl2025',
      authProvider: 'better-auth',
      apiBaseUrl: 'https://api.hashpass.tech/api',
      theme: {
        primary: '#FFD700', // Example gold
        secondary: '#000000',
      },
    } as TenantConfig,
    'bsl': {
      id: 'bsl',
      name: 'Blockchain Summit Latam On Tour',
      domain: 'bsl.hashpass.tech',
      slug: 'bsl',
      authProvider: 'better-auth',
      apiBaseUrl: 'https://api.hashpass.tech/api',
      theme: {
        primary: '#00A9E0',
        secondary: '#06111F',
      },
    } as TenantConfig,
    'peru2026': {
      id: 'peru2026',
      name: 'Blockchain Summit Latam Perú 2026',
      domain: 'peru2026.hashpass.tech',
      slug: 'peru2026',
      authProvider: 'better-auth',
      apiBaseUrl: 'https://api.hashpass.tech/api',
      theme: {
        primary: '#D11A2A',
        secondary: '#06111F',
      },
    } as TenantConfig,
    'chile2026': {
      id: 'chile2026',
      name: 'Blockchain Summit Latam Chile 2026',
      domain: 'chile2026.hashpass.tech',
      slug: 'chile2026',
      authProvider: 'better-auth',
      apiBaseUrl: 'https://api.hashpass.tech/api',
      theme: {
        primary: '#FF5B5B',
        secondary: '#06111F',
      },
    } as TenantConfig,
    'colombia2026': {
      id: 'colombia2026',
      name: 'Blockchain Summit Latam Colombia 2026',
      domain: 'colombia2026.hashpass.tech',
      slug: 'colombia2026',
      authProvider: 'better-auth',
      apiBaseUrl: 'https://api.hashpass.tech/api',
      theme: {
        primary: '#F5C542',
        secondary: '#06111F',
      },
    } as TenantConfig,
    'bsl-dev': {
      id: 'bsl-dev',
      name: 'Blockchain Summit Latam On Tour Dev',
      domain: 'bsl-dev.hashpass.tech',
      slug: 'bsl',
      authProvider: 'better-auth',
      apiBaseUrl: 'https://api-dev.hashpass.tech/api',
      theme: {
        primary: '#00A9E0',
        secondary: '#06111F',
      },
    } as TenantConfig,
    'core': {
      id: 'core',
      name: 'HashPass',
      domain: 'hashpass.tech',
      hostnames: ['www.hashpass.tech', 'hashpass.co', 'www.hashpass.co'],
      slug: 'main',
      authProvider: 'directus',
      apiBaseUrl: 'https://api.hashpass.tech/api',
    } as TenantConfig
  }
};

export type TenantAuthProvider = 'directus' | 'better-auth';

export interface TenantConfig {
  id: string;
  name: string;
  domain: string;
  slug: string;
  hostnames?: string[];
  authProvider?: TenantAuthProvider;
  apiBaseUrl?: string;
  theme?: {
    primary: string;
    secondary: string;
  };
}

// ===========================================
// Legacy Supabase Configuration (DEPRECATED)
// ===========================================
// These values are kept for migration purposes only
// They will be removed after complete migration to Directus SSO
export const LEGACY_SUPABASE_CONFIG = {
  // Old target database (now connected to Directus)
  TARGET_DB: {
    url: 'https://fxgftanraszjjyeidvia.supabase.co',
    host: 'aws-0-us-east-2.pooler.supabase.com',
    user: 'postgres.fxgftanraszjjyeidvia',
    // Note: Database is now accessed via Directus SSO
  },

  // Old source database (read-only for migration)
  SOURCE_DB: {
    url: 'https://tgbdilebadmzqwubsijr.supabase.co',
    host: 'aws-1-us-east-2.pooler.supabase.com',
    user: 'postgres.tgbdilebadmzqwubsijr',
    // Note: Used only for data migration, not auth
  },
};

// ===========================================
// Environment Detection
// ===========================================
const normalizeHostname = (value?: string): string => {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return '';

  try {
    if (raw.includes('://')) {
      return new URL(raw).hostname.toLowerCase();
    }
  } catch {
    // Fall through to path/port cleanup below.
  }

  return raw.split('/')[0].split(':')[0];
};

const readWindowHostname = (): string => {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return '';
  }

  return window.location.hostname;
};

const readWindowOrigin = (): string => {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return '';
  }

  return window.location.origin;
};

const isLocalHostname = (hostname: string): boolean => {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local')
  );
};

const tenantMatchesHostname = (tenant: TenantConfig, hostname: string): boolean => {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname) return false;

  const knownHosts = [tenant.domain, ...(tenant.hostnames || [])];
  return knownHosts.some((candidate) => normalizeHostname(candidate) === normalizedHostname);
};

export const resolveTenantByHostname = (hostname?: string): TenantConfig | null => {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname || isLocalHostname(normalizedHostname)) {
    return SSO_CONFIG.tenants.core;
  }

  return (
    Object.values(SSO_CONFIG.tenants).find((tenant) => tenantMatchesHostname(tenant, normalizedHostname)) ||
    SSO_CONFIG.tenants.core
  );
};

export const resolveTenantApiBaseUrl = (hostname?: string): string | undefined => {
  const apiBaseUrl = resolveTenantByHostname(hostname)?.apiBaseUrl?.trim();
  return apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : undefined;
};

export const ENV_CONFIG = {
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // AWS Region
  REGION: process.env.AWS_REGION || 'us-east-1',

  // API URLs based on environment
  getApiUrl: (hostname?: string) => {
    const explicitApiBase =
      (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_API_BASE_URL) ||
      (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE_URL) ||
      '';

    if (typeof explicitApiBase === 'string' && explicitApiBase.trim().length > 0) {
      return explicitApiBase.trim().replace(/\/$/, '');
    }

    const resolvedHostname = hostname || readWindowHostname();
    const normalizedHostname = normalizeHostname(resolvedHostname);

    if (normalizedHostname && isLocalHostname(normalizedHostname)) {
      const origin = readWindowOrigin();
      return origin ? `${origin}/api` : 'http://localhost:8081/api';
    }

    const tenantApiBaseUrl = resolveTenantApiBaseUrl(normalizedHostname);
    if (tenantApiBaseUrl) {
      return tenantApiBaseUrl;
    }

    return process.env.NODE_ENV === 'production'
      ? 'https://api.hashpass.tech/api'
      : 'https://api-dev.hashpass.tech/api';
  },

  // SSO URL (always points to production SSO)
  getSSOUrl: () => SSO_CONFIG.SSO_URL,

  /**
   * Identifies the current tenant based on host
   */
  getTenant: (hostname?: string) => {
    const host = hostname || readWindowHostname();
    return resolveTenantByHostname(host) || SSO_CONFIG.tenants.core;
  },
};

// ===========================================
// Migration Status
// ===========================================
export const MIGRATION_STATUS = {
  // Database migration completed
  database: {
    completed: true,
    users_migrated: 72,
    functions_migrated: 43,
    target_db: 'fxgftanraszjjyeidvia',
    date: '2025-12-18',
  },

  // Authentication migration
  auth: {
    sso_ready: true,
    directus_url: 'https://sso.hashpass.co',
    admin_configured: true,
    migration_phase: 'in_progress', // in_progress -> complete
  },

  // Next steps
  todo: [
    'Update all authentication flows to use Directus',
    'Replace Supabase auth hooks with Directus auth hooks',
    'Update OAuth flows to use Directus OAuth (future)',
    'Test all authentication scenarios',
    'Remove Supabase dependencies',
  ],
};
