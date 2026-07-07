import { config as loadDotenv, parse as parseDotenv } from 'dotenv';
import fs from 'fs';
import path from 'path';

let envLoaded = false;

const DEV_SERVICE_ROLE_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY_DEV',
  'BSL_SUPABASE_SERVICE_ROLE_KEY',
  'BSL_SUPABASE_SERVICE_ROLE_KEY_DEV',
] as const;

function applyDevServiceRoleOverrides(devEnvPath: string): void {
  if (!fs.existsSync(devEnvPath)) {
    return;
  }

  const parsed = parseDotenv(fs.readFileSync(devEnvPath, 'utf8'));

  for (const key of DEV_SERVICE_ROLE_KEYS) {
    const value = parsed[key];
    if (typeof value === 'string' && value.trim()) {
      process.env[key] = value.trim();
    }
  }
}

export function loadServerEnvFiles(): void {
  if (
    envLoaded ||
    typeof process === 'undefined' ||
    typeof window !== 'undefined' ||
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.JEST_WORKER_ID)
  ) {
    return;
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, '.env.local'),
    path.resolve(cwd, '.env'),
    path.resolve(cwd, '..', '.env.local'),
    path.resolve(cwd, '..', '.env'),
    path.resolve(cwd, '..', '..', '.env.local'),
    path.resolve(cwd, '..', '..', '.env'),
    path.resolve(cwd, '..', '..', '..', '.env.local'),
    path.resolve(cwd, '..', '..', '..', '.env'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      loadDotenv({ path: candidate, override: false, quiet: true });
    }
  }

  const runtimeEnv = String(process.env.EXPO_PUBLIC_ENV || process.env.NODE_ENV || '').toLowerCase();
  if (runtimeEnv !== 'production') {
    // The generated local env files can lag behind the active dev Supabase secret.
    // Reapply the dev service-role key so server-side auth sync uses the working
    // credential without changing the rest of the local profile.
    applyDevServiceRoleOverrides(path.resolve(cwd, '.env.dev'));
  }

  envLoaded = true;
}
