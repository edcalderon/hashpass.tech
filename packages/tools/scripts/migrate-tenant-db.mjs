#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { needsPreMigrationDump, takePreMigrationDump } from './db-backup/pre-migration-dump.mjs';

const REPO_ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const CONFIG_PATH = resolve(REPO_ROOT, 'packages/tools/scripts/config/database-profiles.json');
const MIGRATION_LOCK_KEY = '760231847';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const envPath = resolve(REPO_ROOT, file);
    if (existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
}

function migrationLock(databaseUrl, profileName) {
  const child = spawn('psql', [databaseUrl, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PGCONNECT_TIMEOUT: '30' },
  });
  let output = '';
  let errorOutput = '';
  let exitStatus = null;
  let released = false;
  let heartbeatError = null;
  let heartbeatTimer = null;
  let commandChain = Promise.resolve();
  const waiters = new Map();

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
    for (const [marker, waiter] of waiters) {
      if (output.includes(marker)) {
        waiters.delete(marker);
        clearTimeout(waiter.timeout);
        output = output.slice(output.indexOf(marker) + marker.length);
        waiter.resolve();
        break;
      }
    }
    if (output.length > 1_000_000) output = output.slice(-1_000_000);
  });
  child.stderr.on('data', (chunk) => { errorOutput += chunk; });
  child.on('error', (error) => {
    exitStatus = { code: 'spawn-error', signal: null };
    for (const [marker, waiter] of waiters) {
      waiters.delete(marker);
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  });
  child.on('exit', (code, signal) => {
    exitStatus = { code, signal };
    for (const [marker, waiter] of waiters) {
      waiters.delete(marker);
      clearTimeout(waiter.timeout);
      waiter.reject(new Error(
        `Database migration lock connection ended (${signal || code}): ${errorOutput.trim().slice(-4000).replaceAll(databaseUrl, '[REDACTED_DATABASE_URL]')}`,
      ));
    }
  });

  function command(sql) {
    const execute = () => {
      if (exitStatus) {
        throw new Error(`Database migration lock connection is closed (${exitStatus.signal || exitStatus.code}).`);
      }

      const marker = `__HASHPASS_MIGRATION_${randomUUID().replaceAll('-', '')}__`;
      return new Promise((resolveCommand, rejectCommand) => {
        const timeout = setTimeout(() => {
          waiters.delete(marker);
          rejectCommand(new Error(`Timed out waiting for database migration lock command (${profileName}).`));
          child.kill('SIGTERM');
        }, 60 * 60 * 1000);
        waiters.set(marker, { resolve: resolveCommand, reject: rejectCommand, timeout });

        try {
          child.stdin.write(`${sql}\n\\echo ${marker}\n`, (error) => {
            if (!error) return;
            waiters.delete(marker);
            clearTimeout(timeout);
            rejectCommand(error);
          });
        } catch (error) {
          waiters.delete(marker);
          clearTimeout(timeout);
          rejectCommand(error);
        }
      });
    };

    const pending = commandChain.then(execute);
    commandChain = pending.catch(() => {});
    return pending;
  }

  // Separate deploy workflows can migrate the same database concurrently. The
  // session lock serializes them, but the database's default statement_timeout
  // may expire while a later workflow waits for the active migration batch.
  // Extend the timeout only for lock acquisition; SET LOCAL resets at COMMIT,
  // so migration statements keep the database's configured timeout.
  const acquired = command(
    `BEGIN;\nSET LOCAL statement_timeout = '30min';\n` +
      `SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint);\nCOMMIT;`,
  )
    .then(() => {
      console.log(`Acquired database migration lock for ${profileName}.`);
      heartbeatTimer = setInterval(() => {
        command('SELECT 1;').catch((error) => { heartbeatError = error; });
      }, 30_000);
      return {
        assertHeld() {
          if (exitStatus) {
            throw new Error(`Database migration lock was lost (${exitStatus.signal || exitStatus.code}).`);
          }
          if (heartbeatError) {
            throw new Error(`Database migration lock heartbeat failed: ${heartbeatError.message}`);
          }
        },
        async apply(filePath, migrationId) {
          this.assertHeld();
          const id = migrationId.replaceAll("'", "''");
          const path = filePath.replaceAll("'", "''");
          await command(`\\i '${path}'\nINSERT INTO public.hashpass_schema_migrations (id, file_path)\nVALUES ('${id}', '${path}')\nON CONFLICT (id) DO NOTHING;`);
          this.assertHeld();
        },
        async release() {
          if (released) return;
          released = true;
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (exitStatus) return;
          try {
            await command(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint);`);
            const closed = new Promise((resolveExit, rejectExit) => {
              child.once('exit', (code, signal) => {
                if (code === 0) resolveExit();
                else rejectExit(new Error(`Database migration lock did not close cleanly (${signal || code}).`));
              });
              child.once('error', rejectExit);
            });
            child.stdin.end('\\q\n');
            await closed;
          } catch (error) {
            child.kill('SIGTERM');
            throw error;
          }
        },
      };
    });

  return {
    async acquire() {
      try {
        return await acquired;
      } catch (error) {
        child.kill('SIGTERM');
        throw error;
      }
    },
  };
}

function parseArgs(argv) {
  const args = {
    profile: '',
    tenant: 'bsl',
    env: 'production',
    groups: '',
    dryRun: false,
    skipBackup: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--skip-backup') {
      args.skipBackup = true;
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

async function main() {
  loadEnv();

  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const profile = config.profiles[args.profile];

  if (!profile) {
    throw new Error(`Unknown database profile "${args.profile}". Known profiles: ${Object.keys(config.profiles).join(', ')}`);
  }

  const defaultGroups = [
    ...(profile.inheritDefaultGroups === false ? [] : config.defaultGroups),
    ...(config.profileGroups?.[args.profile] || []),
  ];
  const groupNames = (args.groups ? args.groups.split(',') : defaultGroups)
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

  const lock = await migrationLock(databaseUrl.value, args.profile).acquire();
  try {
    ensureMigrationTable(databaseUrl.value);

    // Hold one database-scoped advisory lock across planning, the production
    // safety dump, and every migration so independent CI deploy workflows
    // cannot race each other or snapshot a half-applied schema.
    lock.assertHeld();
    const pending = migrationFiles.filter((filePath) => !hasMigration(databaseUrl.value, migrationIdFromPath(filePath)));
    if (needsPreMigrationDump({ environment: profile.environment, pendingCount: pending.length, skip: args.skipBackup })) {
      await takePreMigrationDump({ databaseUrl: databaseUrl.value, profile: args.profile, pending: pending.length });
    } else if (profile.environment === 'production' && pending.length > 0) {
      console.warn('WARNING: --skip-backup given; applying production migrations without a pre-migration dump.');
    }

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

      lock.assertHeld();
      console.log(`Applying ${id}...`);
      await lock.apply(absolutePath, id);
    }

    console.log('Tenant DB migration completed.');
  } finally {
    await lock.release();
  }
}

try {
  await main();
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exit(1);
}
