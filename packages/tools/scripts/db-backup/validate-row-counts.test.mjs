import assert from 'node:assert/strict';
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
});
