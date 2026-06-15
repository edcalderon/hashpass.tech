/// <reference types="jest" />

const {
  formatEnvFile,
  normalizeSyncEnvironment,
  resolveExpoEnvironment,
  sanitizeExpoEnv,
} = require('../../../../packages/tools/scripts/sync-mobile-eas-env.js') as {
  formatEnvFile: (env: Record<string, string>) => string;
  normalizeSyncEnvironment: (value?: string) => string;
  resolveExpoEnvironment: (value: string) => string;
  sanitizeExpoEnv: (env: Record<string, string>) => Record<string, string>;
};

describe('sync-mobile-eas-env', () => {
  it('normalizes sync environments and resolves the Expo target environment', () => {
    expect(normalizeSyncEnvironment()).toBe('production');
    expect(normalizeSyncEnvironment('prod')).toBe('production');
    expect(normalizeSyncEnvironment('development')).toBe('development');
    expect(resolveExpoEnvironment('production')).toBe('production');
    expect(resolveExpoEnvironment('development')).toBe('preview');
  });

  it('removes local EAS-only keys before pushing env vars to Expo', () => {
    const sanitized = sanitizeExpoEnv({
      EAS_PROJECT_ID: 'prod-project',
      EAS_PROJECT_ID_DEV: 'dev-project',
      EXPO_TOKEN: 'prod-token',
      EXPO_TOKEN_DEV: 'dev-token',
      NODE_ENV: 'development',
      EXPO_PUBLIC_ENV: 'development',
      EXPO_PUBLIC_EAS_PROJECT_ID: 'prod-project',
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      DIRECTUS_URL: 'https://sso.hashpass.co',
    });

    expect(sanitized).toEqual({
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      DIRECTUS_URL: 'https://sso.hashpass.co',
    });
  });

  it('formats env files as dotenv content', () => {
    expect(
      formatEnvFile({
        A_KEY: 'plain',
        B_KEY: 'value with spaces',
      }),
    ).toBe('A_KEY="plain"\nB_KEY="value with spaces"\n');
  });
});
