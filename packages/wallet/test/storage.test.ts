import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeVaultStore } from '../src/storage-native.ts';
import { createWebVaultStore } from '../src/storage-web.ts';
import { IDBFactory } from 'fake-indexeddb';

test('IndexedDB compare-and-swap is atomic across separate store instances', async () => {
  const factory = new IDBFactory();
  const a = createWebVaultStore(factory), b = createWebVaultStore(factory);
  const results = await Promise.all([
    a.compareAndSwap('wallet', null, 'first'), b.compareAndSwap('wallet', null, 'second'),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  const original = await a.read('wallet');
  assert.equal(await a.compareAndSwap('wallet', 'wrong', 'replacement'), false);
  assert.equal(await a.read('wallet'), original);
  assert.equal(await b.compareAndSwap('wallet', original, 'rotation'), true);
  assert.equal(await a.read('wallet'), 'rotation');
});

test('native writes are serialized across adapter instances; errors release the lock', async () => {
  let value: string | null = null;
  let failWrite = true;
  const keychain = {
    async available() { return true; }, async read() { return value; },
    async write(_key: string, next: string) {
      await new Promise(resolve => setTimeout(resolve, 5));
      if (failWrite) { failWrite = false; throw new Error('write_failed'); }
      value = next;
    },
  };
  const a = createNativeVaultStore(keychain), b = createNativeVaultStore(keychain);
  await assert.rejects(a.compareAndSwap('wallet', null, 'bad'), /write_failed/);
  const results = await Promise.all([
    a.compareAndSwap('wallet', null, 'a'), b.compareAndSwap('wallet', null, 'b'),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await a.read('wallet'), 'a');
});

test('native storage unavailability fails closed without touching fallback storage', async () => {
  const store = createNativeVaultStore({
    async available() { return false; },
    async read() { throw new Error('must_not_read'); },
    async write() { throw new Error('must_not_write'); },
  });
  await assert.rejects(store.read('wallet'), /secure_storage_unavailable/);
  await assert.rejects(store.compareAndSwap('wallet', null, 'data'), /secure_storage_unavailable/);
});
