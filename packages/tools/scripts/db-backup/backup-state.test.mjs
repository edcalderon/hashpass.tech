import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSkipUnchangedBackup } from './backup-state.mjs';

const now = '2026-11-09T20:00:00Z';
const state = {
  schema_version: 1,
  fingerprint_algorithm: 'pg_restore_sql_sha256_v1',
  database: 'core-prod',
  fingerprint: 'a'.repeat(64),
  dump_key: 'prod/core/core-prod_20261109T120000Z.dump',
  counts_key: 'prod/core/core-prod_20261109T120000Z.counts.txt',
  dumped_at: '2026-11-09T12:00:00Z',
  table_count: 2,
  total_rows: 16,
};

function canSkip(overrides = {}) {
  return shouldSkipUnchangedBackup({
    currentFingerprint: state.fingerprint,
    database: 'core-prod',
    prefix: 'prod/core',
    state,
    dumpSize: 3_000_000,
    countsSize: 2_000,
    tableCount: 2,
    totalRows: 16,
    now,
    ...overrides,
  });
}

test('skips the full dump only for an identical recent verified dump with its sidecar', () => {
  assert.equal(canSkip(), true);
});

test('a one-byte database change keeps a full dump', () => {
  assert.equal(canSkip({ currentFingerprint: 'b'.repeat(64) }), false);
});

test('a row-count change keeps a full dump even when the fingerprint matches', () => {
  assert.equal(canSkip({ totalRows: 17 }), false);
  assert.equal(canSkip({ tableCount: 3 }), false);
});

test('missing or malformed state keeps a full dump', () => {
  assert.equal(canSkip({ state: null }), false);
  assert.equal(canSkip({ state: { ...state, fingerprint: 'not-a-sha256' } }), false);
  assert.equal(canSkip({ state: { ...state, schema_version: 2 } }), false);
});

test('missing, tiny, wrong-target, or malformed restore points keep a full dump', () => {
  assert.equal(canSkip({ dumpSize: 99_999 }), false);
  assert.equal(canSkip({ countsSize: 0 }), false);
  assert.equal(canSkip({ dumpSize: Number.NaN }), false);
  assert.equal(canSkip({ state: { ...state, dump_key: 'prod/core/missing.dump' } }), false);
  assert.equal(canSkip({ state: { ...state, counts_key: 'dev/shared/core-prod_20261109T120000Z.counts.txt' } }), false);
});

test('forces a fresh full dump at the seven-day recovery-point limit', () => {
  const oldState = {
    ...state,
    dump_key: 'prod/core/core-prod_20261102T195959Z.dump',
    counts_key: 'prod/core/core-prod_20261102T195959Z.counts.txt',
    dumped_at: '2026-11-02T19:59:59Z',
  };
  assert.equal(canSkip({ state: oldState }), false);
});
