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
      'https://blockchainsummit.hashpass.lat',
      'https://blockchainsummit-dev.hashpass.lat',
      'https://api.hashpass.tech',
      'https://api-dev.hashpass.tech',
      'https://sso-dev.hashpass.co',
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
      slug: 'bsl2025',
      theme: {
        primary: '#FFD700', // Example gold
        secondary: '#000000',
      },
    } as TenantConfig,
    'core': {
      id: 'core',
      name: 'HashPass',
      domain: 'hashpass.tech',
      slug: 'main',
    } as TenantConfig
  }
};

export interface TenantConfig {
  id: string;
  name: string;
  domain: string;
  slug: string;
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
export const ENV_CONFIG = {
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // AWS Region
  REGION: process.env.AWS_REGION || 'us-east-1',

  // API URLs based on environment
  getApiUrl: () => {
    if (typeof window !== 'undefined') {
      // Client-side: use current domain
      return window.location.origin;
    }

    // Server-side or default
    return process.env.NODE_ENV === 'production'
      ? 'https://blockchainsummit.hashpass.lat'
      : 'http://localhost:8081';
  },

  // SSO URL (always points to production SSO)
  getSSOUrl: () => SSO_CONFIG.SSO_URL,

  /**
   * Identifies the current tenant based on host
   */
  getTenant: (hostname?: string) => {
    const host = hostname || (typeof window !== 'undefined' ? window.location.hostname : '');

    // Find tenant by domain mapping
    const tenant = Object.values(SSO_CONFIG.tenants).find(t => t.domain === host);

    // Fallback to core if not found or if on localhost
    if (!tenant || host.includes('localhost')) {
      return SSO_CONFIG.tenants['core'];
    }

    return tenant;
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
