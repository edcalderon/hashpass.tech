import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handler } from './index';
import { resetAdminDbCache, setAdminDbForTesting } from '../src/server';
import { createFakeSupabaseClient } from '../src/test-utils/fake-supabase-client';

test.afterEach(() => {
  setAdminDbForTesting(null);
  resetAdminDbCache();
});

test('an EventBridge scheduled event archives expired QR links', async () => {
  const client = createFakeSupabaseClient();
  setAdminDbForTesting(client as unknown as SupabaseClient);
  const id = 'expired-link';
  client._tables.set('qr_links', new Map([[id, {
    id,
    status: 'active',
    expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
    deleted_at: null,
  }]]));

  const response = await handler({ source: 'aws.events', 'detail-type': 'Scheduled Event' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { archived: 1 });
  assert.equal(client._tables.get('qr_links')?.get(id)?.status, 'archived');
});
