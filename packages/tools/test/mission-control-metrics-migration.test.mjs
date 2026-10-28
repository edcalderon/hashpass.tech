import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = resolve(import.meta.dirname, '../../../db/migrations/V157__mission_control_metrics.sql');

test('Mission Control metrics are aggregate-only and private by default', () => {
  const sql = readFileSync(migration, 'utf8');
  assert.match(sql, /CREATE(?: OR REPLACE)? FUNCTION public\.mission_control_metrics\(\) RETURNS jsonb/i);
  assert.match(sql, /count\(DISTINCT user_id\)/i);
  assert.match(sql, /marketing_activity/i);
  assert.match(sql, /interval '30 days'/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.mission_control_metrics\(\) FROM PUBLIC,\s*anon,\s*authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.mission_control_metrics\(\) TO service_role/i);
  assert.doesNotMatch(sql, /jsonb_agg\([^)]*(email|user_id|name)/i);
});
