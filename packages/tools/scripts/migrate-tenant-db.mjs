#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const REPO_ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const CONFIG_PATH = resolve(REPO_ROOT, 'packages/tools/scripts/config/database-profiles.json');

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const envPath = resolve(REPO_ROOT, file);
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath, override: false, quiet: true });
    }
  }
}

function parseArgs(argv) {
  const args = {
    profile: '',
    tenant: 'bsl',
    env: 'production',
    groups: '',
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--profile=')) {
      args.profile = arg.slice('--profile='.length);
    } else if (arg === '--profile') {
      args.profile = argv[++index] || '';
    } else if (arg.startsWith('--tenant=')) {
      args.tenant = arg.slice('--tenant='.length);
    } else if (arg === '--tenant') {
      args.tenant = argv[++index] || args.tenant;
    } else if (arg.startsWith('--env=')) {
      args.env = arg.slice('--env='.length);
    } else if (arg === '--env') {
      args.env = argv[++index] || args.env;
    } else if (arg.startsWith('--groups=')) {
      args.groups = arg.slice('--groups='.length);
    } else if (arg === '--groups') {
      args.groups = argv[++index] || '';
    }
  }

  if (!args.profile) {
    const normalizedEnv = ['prod', 'production', 'main'].includes(args.env) ? 'production' : 'development';
    args.profile = `${args.tenant}-${normalizedEnv}`;
  }

  return args;
}

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return { name, value };
  }

  return { name: '', value: '' };
}

function psql(databaseUrl, args, options = {}) {
  try {
    return execFileSync('psql', [databaseUrl, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = typeof error.stderr === 'string' ? error.stderr : '';
    const message = stderr.trim() || error.message || 'psql command failed';
    throw new Error(message.replaceAll(databaseUrl, '[REDACTED_DATABASE_URL]'));
  }
}

function migrationIdFromPath(filePath) {
  return filePath.split('/').pop()?.replace(/\.sql$/, '') || filePath;
}

function ensureMigrationTable(databaseUrl) {
  psql(databaseUrl, [
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `CREATE TABLE IF NOT EXISTS public.hashpass_schema_migrations (
      id text PRIMARY KEY,
      file_path text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );`,
  ]);
}

function hasMigration(databaseUrl, id) {
  const output = psql(databaseUrl, [
    '-tA',
    '-c',
    'SELECT 1 FROM public.hashpass_schema_migrations WHERE id = $SQL$' + id + '$SQL$ LIMIT 1;',
  ]);

  return output.trim() === '1';
}

function markMigration(databaseUrl, id, filePath) {
  psql(databaseUrl, [
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `INSERT INTO public.hashpass_schema_migrations (id, file_path)
     VALUES ($SQL$${id}$SQL$, $SQL$${filePath}$SQL$)
     ON CONFLICT (id) DO NOTHING;`,
  ]);
}

function resolveMigrationFiles(config, groupNames) {
  const files = [];

  for (const groupName of groupNames) {
    const groupFiles = config.groups[groupName];
    if (!groupFiles) {
      throw new Error(`Unknown migration group "${groupName}". Known groups: ${Object.keys(config.groups).join(', ')}`);
    }

    files.push(...groupFiles);
  }

  return [...new Set(files)];
}

function main() {
  loadEnv();

  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const profile = config.profiles[args.profile];

  if (!profile) {
    throw new Error(`Unknown database profile "${args.profile}". Known profiles: ${Object.keys(config.profiles).join(', ')}`);
  }

  const groupNames = (args.groups ? args.groups.split(',') : config.defaultGroups)
    .map((group) => group.trim())
    .filter(Boolean);
  const migrationFiles = resolveMigrationFiles(config, groupNames);
  const databaseUrl = firstEnv(profile.databaseUrlEnv);

  console.log('Tenant DB migration plan');
  console.log(`  Profile: ${args.profile}`);
  console.log(`  Groups:  ${groupNames.join(', ')}`);
  console.log(`  DB env:  ${databaseUrl.name || profile.databaseUrlEnv.join(' | ')}`);
  console.log(`  Dry run: ${args.dryRun ? 'yes' : 'no'}`);

  if (args.dryRun) {
    for (const filePath of migrationFiles) {
      console.log(`  - ${filePath}`);
    }
    return;
  }

  if (!databaseUrl.value) {
    throw new Error(`Missing database URL. Set one of: ${profile.databaseUrlEnv.join(', ')}`);
  }

  ensureMigrationTable(databaseUrl.value);

  for (const filePath of migrationFiles) {
    const absolutePath = resolve(REPO_ROOT, filePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`Migration file not found: ${filePath}`);
    }

    const id = migrationIdFromPath(filePath);
    if (hasMigration(databaseUrl.value, id)) {
      console.log(`Skipping ${id}; already applied.`);
      continue;
    }

    console.log(`Applying ${id}...`);
    psql(databaseUrl.value, ['-v', 'ON_ERROR_STOP=1', '-f', absolutePath], { stdio: 'inherit' });
    markMigration(databaseUrl.value, id, filePath);
  }

  console.log('Tenant DB migration completed.');
}

try {
  main();
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
}
