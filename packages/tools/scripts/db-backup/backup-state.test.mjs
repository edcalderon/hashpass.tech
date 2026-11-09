import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('keeps daily and monthly retention snapshots even when unchanged', () => {
  assert.equal(canSkip({ forceFull: true }), false);
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

test('CLI reads backup state and prints skip/full decisions', () => {
  const helperPath = fileURLToPath(new URL('./backup-state.mjs', import.meta.url));
  const tempDir = mkdtempSync(join(tmpdir(), 'hashpass-backup-state-'));
  const statePath = join(tempDir, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));

  const invoke = (path, forceFull = false) => spawnSync(process.execPath, [
    helperPath,
    path,
    'core-prod',
    'prod/core',
    state.fingerprint,
    '3000000',
    '2000',
    '2',
    '16',
    now,
    String(forceFull),
  ], { encoding: 'utf8' });

  try {
    assert.deepEqual([invoke(statePath).status, invoke(statePath).stdout], [0, 'skip\n']);
    assert.deepEqual([invoke(statePath, true).status, invoke(statePath, true).stdout], [0, 'full\n']);
    assert.deepEqual([invoke(join(tempDir, 'missing.json')).status, invoke(join(tempDir, 'missing.json')).stdout], [0, 'full\n']);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
