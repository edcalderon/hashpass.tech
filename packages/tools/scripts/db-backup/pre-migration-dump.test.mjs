import assert from 'node:assert/strict';
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

test('a failing dump aborts and never leaks the database URL', () => {
  const url = 'postgresql://user:secret@db.example:5432/postgres';
  const run = () => {
    const error = new Error('boom');
    error.stderr = Buffer.from(`could not connect to ${url}`);
    throw error;
  };
  assert.throws(
    () => takePreMigrationDump({ databaseUrl: url, profile: 'core-production', pending: 1, run }),
    (error) => /Pre-migration backup failed/.test(error.message) && !error.message.includes('secret'),
  );
});
