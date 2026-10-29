import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { dumpFileName, needsPreMigrationDump, takePreMigrationDump } from './pre-migration-dump.mjs';

test('only production runs with pending migrations are backed up', () => {
  assert.equal(needsPreMigrationDump({ environment: 'production', pendingCount: 2, skip: false }), true);
  assert.equal(needsPreMigrationDump({ environment: 'production', pendingCount: 0, skip: false }), false);
  assert.equal(needsPreMigrationDump({ environment: 'development', pendingCount: 2, skip: false }), false);
  assert.equal(needsPreMigrationDump({ environment: 'production', pendingCount: 2, skip: true }), false);
});

test('dump file names carry the profile and a sortable UTC stamp', () => {
  assert.equal(
    dumpFileName('core-production', new Date('2026-10-21T08:31:46.123Z')),
    'pre-migration_core-production_20261021T083146Z.dump',
  );
});

test('a failing dump aborts and never leaks the database URL', async () => {
  const url = 'postgresql://user:secret@db.example:5432/postgres';
  const run = () => {
    const error = new Error('boom');
    error.stderr = Buffer.from(`could not connect to ${url}`);
    throw error;
  };
  await assert.rejects(
    takePreMigrationDump({ databaseUrl: url, profile: 'core-production', pending: 1, run }),
    (error) => /Pre-migration backup failed/.test(error.message) && !error.message.includes('secret'),
  );
});

test('CI refuses to migrate production when the pre-migration S3 upload fails', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hashpass-pre-migration-test-'));
  const envNames = [
    'HASHPASS_BACKUP_DIR',
    'DB_BACKUP_BUCKET',
    'AWS_TARGET_ACCOUNT_ID',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'REQUIRE_PRE_MIGRATION_UPLOAD',
  ];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    HASHPASS_BACKUP_DIR: dir,
    DB_BACKUP_BUCKET: 'backup-bucket',
    AWS_TARGET_ACCOUNT_ID: '123456789012',
    AWS_ACCESS_KEY_ID: 'test-access-key',
    AWS_SECRET_ACCESS_KEY: 'test-secret-key',
    REQUIRE_PRE_MIGRATION_UPLOAD: 'true',
  });

  const run = (_command, args) => {
    if (args.some((arg) => arg.includes('pg_dump'))) {
      const dumpPath = args.at(-1).match(/-f \/out\/(\S+)/)?.[1];
      assert.ok(dumpPath);
      writeFileSync(join(dir, dumpPath), Buffer.alloc(100_001));
      return Buffer.alloc(0);
    }
    if (args[0] === '--profile' || args[0] === 'sts') return Buffer.from('123456789012');
    if (args[0] === 's3api') {
      const error = new Error('access denied');
      error.stderr = Buffer.from('AccessDenied');
      throw error;
    }
    return Buffer.alloc(0);
  };

  try {
    await assert.rejects(
      takePreMigrationDump({ databaseUrl: 'postgresql://db.example/postgres', profile: 'core-production', pending: 1, run }),
      /Required S3 pre-migration backup upload failed.*no migration was applied/,
    );
  } finally {
    for (const name of envNames) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
