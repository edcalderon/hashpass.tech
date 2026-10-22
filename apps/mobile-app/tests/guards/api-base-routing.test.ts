/// <reference types="jest" />
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Client code must reach the API through lib/api-client (apiClient /
 * getRuntimeApiBaseUrl). Reading EXPO_PUBLIC_API_BASE_URL or hardcoding a
 * deployed Lambda URL bypasses the localhost / EXPO_PUBLIC_API_TARGET routing
 * and sends local development to api-dev (503s, wrong data).
 */
const ROOT = join(__dirname, '../..');
const SCAN_DIRS = ['lib', 'hooks', 'components', 'contexts', 'app', 'config', 'utils', 'services'];
// Server code legitimately knows its own hostnames; the client + runtime script own the routing.
const ALLOWED = [
  'lib/api-client.ts',
  'lib/eas-config.js',
  'app/+html.tsx',
  'config/sso-config.ts',
  'config/supabase-profiles.ts',
];
const SKIPPED = [/^app\/api\//, /^lib\/server\//, /\.d\.ts$/];
const FORBIDDEN = /EXPO_PUBLIC_API_BASE_URL|https:\/\/api(-dev)?\.hashpass\.tech\/api/;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist') return [];
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx|js)$/.test(name) ? [full] : [];
  });

describe('API base routing guard', () => {
  it('only the shared API client resolves the API base URL', () => {
    const offenders = SCAN_DIRS.flatMap((dir) => {
      try { return walk(join(ROOT, dir)); } catch { return []; }
    })
      .map((file) => relative(ROOT, file))
      .filter((file) => !ALLOWED.includes(file) && !SKIPPED.some((pattern) => pattern.test(file)))
      .filter((file) => FORBIDDEN.test(readFileSync(join(ROOT, file), 'utf8')));

    expect(offenders).toEqual([]);
  });
});
