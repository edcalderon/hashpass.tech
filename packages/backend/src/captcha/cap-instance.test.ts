import assert from 'node:assert/strict';
import test from 'node:test';
import { getCapInstance, type CapStorageHooks } from './cap-instance';

test('uses caller-provided shared storage hooks for a captcha namespace', () => {
  const storage: CapStorageHooks = {
    challenges: {
      store: async () => undefined,
      read: async () => null,
      delete: async () => undefined,
      deleteExpired: async () => undefined,
    },
    tokens: {
      store: async () => undefined,
      get: async () => null,
      delete: async () => undefined,
      deleteExpired: async () => undefined,
    },
  };

  const cap = getCapInstance(`shared-storage-${Date.now()}`, storage);

  assert.equal(cap.config.storage, storage);
  assert.equal(cap.config.noFSState, true);
});
