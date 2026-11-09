import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { summarizeRowCounts } from './validate-row-counts.mjs';

test('summarizes nonempty public data for core production', () => {
  assert.deepEqual(
    summarizeRowCounts('profiles|12\nevents|4\n', 'core-production'),
    { tableCount: 2, totalRows: 16 },
  );
});

test('rejects a core production database with no rows', () => {
  assert.throws(
    () => summarizeRowCounts('profiles|0\nevents|0\n', 'core-production'),
    /zero public rows/,
  );
});

test('allows a shared development database with no application rows', () => {
  assert.deepEqual(
    summarizeRowCounts('profiles|0\nevents|0\n', 'shared-dev'),
    { tableCount: 2, totalRows: 0 },
  );
});

test('rejects missing, malformed, duplicate, or unsafe row counts', () => {
  assert.throws(() => summarizeRowCounts('', 'shared-dev'), /No public tables/);
  assert.throws(() => summarizeRowCounts('profiles|nope', 'shared-dev'), /invalid/);
  assert.throws(() => summarizeRowCounts('profiles|1\nprofiles|2', 'shared-dev'), /invalid/);
  assert.throws(() => summarizeRowCounts('profiles|99999999999999999999', 'shared-dev'), /supported range/);
  assert.throws(() => summarizeRowCounts(null, 'shared-dev'), /required/);
  assert.throws(() => summarizeRowCounts('', null), /required/);
});

test('CLI prints a row summary and exits nonzero for invalid input', () => {
  const helperPath = fileURLToPath(new URL('./validate-row-counts.mjs', import.meta.url));
  const tempDir = mkdtempSync(join(tmpdir(), 'hashpass-row-counts-'));
  const countsPath = join(tempDir, 'counts.txt');

  try {
    writeFileSync(countsPath, 'profiles|12\nevents|4\n');
    const valid = spawnSync(process.execPath, [helperPath, countsPath, 'core-production'], { encoding: 'utf8' });
    assert.equal(valid.status, 0);
    assert.equal(valid.stdout, '2|16\n');

    writeFileSync(countsPath, '');
    const invalid = spawnSync(process.execPath, [helperPath, countsPath, 'shared-dev'], { encoding: 'utf8' });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /No public tables/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
