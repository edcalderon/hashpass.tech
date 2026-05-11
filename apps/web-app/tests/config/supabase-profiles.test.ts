/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import { resolvePublicSupabaseConfig } from '../../config/supabase-profiles';

describe('resolvePublicSupabaseConfig', () => {
  it('falls back to canonical public envs for bsl-production', () => {
    const env: Record<string, string> = {
      EXPO_PUBLIC_SUPABASE_URL: 'https://generic-project.supabase.co',
      EXPO_PUBLIC_SUPABASE_KEY: 'anon1',
    };

    const config = resolvePublicSupabaseConfig({
      profileId: 'bsl-production',
      readEnv: (name) => env[name],
    });

    expect(config.profileId).toBe('bsl-production');
    expect(config.supabaseUrl).toBe('https://generic-project.supabase.co');
    expect(config.supabaseAnonKey).toBe('anon1');
  });

  it('prefers BSL-specific envs when present', () => {
    const env: Record<string, string> = {
      EXPO_PUBLIC_BSL_SUPABASE_URL_PROD: 'https://bsl-project.supabase.co',
      EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD: 'anon2',
      EXPO_PUBLIC_SUPABASE_URL: 'https://generic-project.supabase.co',
      EXPO_PUBLIC_SUPABASE_KEY: 'anon1',
    };

    const config = resolvePublicSupabaseConfig({
      profileId: 'bsl-production',
      readEnv: (name) => env[name],
    });

    expect(config.supabaseUrl).toBe('https://bsl-project.supabase.co');
    expect(config.supabaseAnonKey).toBe('anon2');
  });
});
