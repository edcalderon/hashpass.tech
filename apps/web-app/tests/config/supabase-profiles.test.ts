/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import { resolvePublicSupabaseConfig } from '../../config/supabase-profiles';

const PUBLIC_SUPABASE_URL_ENV = ['EXPO', 'PUBLIC', 'SUPABASE', 'URL'].join('_');
const PUBLIC_SUPABASE_KEY_ENV = ['EXPO', 'PUBLIC', 'SUPABASE', 'KEY'].join('_');
const PUBLIC_SUPABASE_ANON_KEY_ENV = ['EXPO', 'PUBLIC', 'SUPABASE', 'ANON', 'KEY'].join('_');
const BSL_PROD_SUPABASE_URL_ENV = ['EXPO', 'PUBLIC', 'BSL', 'SUPABASE', 'URL', 'PROD'].join('_');
const BSL_PROD_SUPABASE_ANON_KEY_ENV = ['EXPO', 'PUBLIC', 'BSL', 'SUPABASE', 'ANON', 'KEY', 'PROD'].join('_');

describe('resolvePublicSupabaseConfig', () => {
  it('falls back to canonical public envs for bsl-production', () => {
    const env: Record<string, string> = {
      [PUBLIC_SUPABASE_URL_ENV]: 'https://generic-project.supabase.co',
      [PUBLIC_SUPABASE_KEY_ENV]: 'anon1',
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
      [BSL_PROD_SUPABASE_URL_ENV]: 'https://bsl-project.supabase.co',
      [BSL_PROD_SUPABASE_ANON_KEY_ENV]: 'anon2',
      [PUBLIC_SUPABASE_URL_ENV]: 'https://generic-project.supabase.co',
      [PUBLIC_SUPABASE_KEY_ENV]: 'anon1',
    };

    const config = resolvePublicSupabaseConfig({
      profileId: 'bsl-production',
      readEnv: (name) => env[name],
    });

    expect(config.supabaseUrl).toBe('https://bsl-project.supabase.co');
    expect(config.supabaseAnonKey).toBe('anon2');
  });

  it('accepts the canonical anon key alias for bsl-production', () => {
    const env: Record<string, string> = {
      [PUBLIC_SUPABASE_URL_ENV]: 'https://generic-project.supabase.co',
      [PUBLIC_SUPABASE_ANON_KEY_ENV]: 'anon1',
    };

    const config = resolvePublicSupabaseConfig({
      profileId: 'bsl-production',
      readEnv: (name) => env[name],
    });

    expect(config.supabaseUrl).toBe('https://generic-project.supabase.co');
    expect(config.supabaseAnonKey).toBe('anon1');
  });

  it('falls back to browser runtime when env vars are absent', () => {
    const globalAny = globalThis as Record<string, unknown>;
    const previousRuntime = globalAny.__HASHPASS_RUNTIME__;

    try {
      globalAny.__HASHPASS_RUNTIME__ = {
        supabaseUrl: 'https://browser-project.supabase.co',
        supabaseAnonKey: 'anon-browser',
      };

      const config = resolvePublicSupabaseConfig({
        profileId: 'bsl-production',
        readEnv: () => undefined,
      });

      expect(config.supabaseUrl).toBe('https://browser-project.supabase.co');
      expect(config.supabaseAnonKey).toBe('anon-browser');
    } finally {
      if (typeof previousRuntime === 'undefined') {
        delete globalAny.__HASHPASS_RUNTIME__;
      } else {
        globalAny.__HASHPASS_RUNTIME__ = previousRuntime;
      }
    }
  });
});
