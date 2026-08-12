#!/usr/bin/env node
// Regenerates db/schema-snapshots/*.sql — the single source of truth for what's
// ACTUALLY live in each Supabase project's public schema (as opposed to
// db/migrations/, which is what was *intended* to be applied — see
// apps/docs/docs/infra/supabase-project-map.md's "Migration bootstrap findings"
// section for why those two things have drifted apart before).
//
// Uses a postgres:17-alpine container to run pg_dump, since Supabase runs
// Postgres 17 and this machine's native pg_dump is v16 (older pg_dump can't
// safely dump a newer server's schema).
//
// Usage: node packages/tools/scripts/dump-db-schemas.mjs [--project core-prod|bsl-prod|dev]

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const REPO_ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const OUT_DIR = resolve(REPO_ROOT, 'db/schema-snapshots');

// Mirrors packages/tools/scripts/config/database-profiles.json's databaseUrlEnv
// priority chains for core-production / bsl-production / core-development.
// core-development and bsl-development resolve to the SAME physical project
// (gsugeqozyeokncpbndna, the shared dev DB — see supabase-project-map.md), so
// there is deliberately only one "dev" entry here, not two.
const PROJECTS = {
  'core-prod': { ref: 'fxgftanraszjjyeidvia', envNames: ['SUPABASE_DB_URL_PROD', 'DATABASE_URL_PROD', 'PROD_DB_URL'] },
  'bsl-prod': { ref: 'mnnqryrdlhddorqsrtbn', envNames: ['BSL_SUPABASE_DB_URL_PROD', 'SUPABASE_DB_URL_BSL_PROD', 'DATABASE_URL_BSL_PROD', 'PROD_BSL_DB_URL'] },
  dev: { ref: 'gsugeqozyeokncpbndna', envNames: ['SUPABASE_DB_URL_DEV', 'DATABASE_URL_DEV', 'DEV_DB_URL'] },
};

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const envPath = resolve(REPO_ROOT, file);
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath, override: false, quiet: true });
    }
  }
}

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`None of these env vars are set: ${names.join(', ')}`);
}

function parseArgs(argv) {
  const idx = argv.indexOf('--project');
  return { project: idx >= 0 ? argv[idx + 1] : null };
}

function dumpProject(label, databaseUrl) {
  const outFile = resolve(OUT_DIR, `${label}.sql`);
  console.log(`Dumping ${label} -> db/schema-snapshots/${label}.sql`);
  const sql = execFileSync(
    'docker',
    ['run', '--rm', '--network', 'host', 'postgres:17-alpine', 'pg_dump', databaseUrl, '--schema-only', '--schema=public', '--no-owner', '--no-privileges'],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 },
  );
  writeFileSync(outFile, sql);
}

function main() {
  loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });
  const { project } = parseArgs(process.argv.slice(2));
  const labels = project ? [project] : Object.keys(PROJECTS);

  for (const label of labels) {
    const entry = PROJECTS[label];
    if (!entry) {
      throw new Error(`Unknown project "${label}". Known: ${Object.keys(PROJECTS).join(', ')}`);
    }
    const databaseUrl = firstEnv(entry.envNames);
    dumpProject(label, databaseUrl);
  }

  console.log('Done. Review the diff (git diff db/schema-snapshots/) to see what changed since the last snapshot.');
}

main();
