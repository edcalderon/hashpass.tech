import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalWallet } from '../src/local-wallet.ts';
import type { VaultStore } from '../src/storage.ts';
import { vaultStorageKey, type VaultScope } from '../src/vault.ts';
const scope: VaultScope = { environment: 'development', ownerId: 'user-a', walletId: 'wallet-a' };
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const password = 'public test password only';
function memoryStore(): VaultStore {
  const values = new Map<string, string>();
  return {
    async read(key) { return values.get(key) ?? null; },
    async compareAndSwap(key, expected, next) {
      if ((values.get(key) ?? null) !== expected) return false;
      values.set(key, next); return true;
    },
  };
}

test('concurrent creation cannot replace existing seed material', async () => {
  const store = memoryStore();
  const a = new LocalWallet(scope, store), b = new LocalWallet(scope, store);
  const results = await Promise.allSettled([
    a.create(phrase, 'testnet', password), b.create(phrase, 'testnet', password),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const blob = await store.read(vaultStorageKey(scope));
  await assert.rejects(a.create(phrase, 'testnet', password));
  assert.equal(await store.read(vaultStorageKey(scope)), blob);
});

test('password rotation keeps addresses and fails with old password', async () => {
  const wallet = new LocalWallet(scope, memoryStore());
  const initial = await wallet.create(phrase, 'testnet', password);
  await wallet.changePassword(password, 'a different public test password');
  await assert.rejects(wallet.unlock(password));
  assert.deepEqual(await wallet.unlock('a different public test password'), initial);
});

test('a failed durable write does not report successful creation', async () => {
  const wallet = new LocalWallet(scope, {
    async read() { return null; }, async compareAndSwap() { throw new Error('storage_unavailable'); },
  });
  await assert.rejects(wallet.create(phrase, 'testnet', password), /storage_unavailable/);
});

test('missing vault requires recovery; unlocking never generates replacement keys', async () => {
  const store = memoryStore();
  const wallet = new LocalWallet(scope, store);
  await assert.rejects(wallet.unlock(password), /vault_missing/);
  assert.equal(await store.read(vaultStorageKey(scope)), null);
});

test('locking while unlock is pending prevents a late unlock result', async () => {
  const store = memoryStore();
  const wallet = new LocalWallet(scope, store);
  await wallet.create(phrase, 'testnet', password);
  const pending = wallet.unlock(password);
  wallet.lock();
  await assert.rejects(pending, /wallet_locked/);
});

test('export requires fresh password and recovery on another device preserves addresses', async () => {
  const wallet = new LocalWallet(scope, memoryStore());
  const original = await wallet.create(phrase, 'testnet', password);
  await assert.rejects(wallet.exportBackup('wrong password but long enough', password));
  const backup = await wallet.exportBackup(password, 'public recovery file password');
  const otherDevice = new LocalWallet(scope, memoryStore());
  const restored = await otherDevice.restore(backup, 'public recovery file password', password, original);
  assert.deepEqual(restored, original);
  await assert.rejects(otherDevice.restore(backup, 'public recovery file password', password, original));
  assert.equal(await wallet.recoveryPhrase(password), phrase);
});

test('new-wallet creation uses the injected device CSPRNG and never regenerates an existing vault', async () => {
  let calls = 0;
  const wallet = new LocalWallet(scope, memoryStore(), size => {
    calls += 1; return crypto.getRandomValues(new Uint8Array(size));
  });
  const publicWallet = await wallet.createNew('testnet', password);
  assert.equal(publicWallet.network, 'testnet');
  assert.equal((await wallet.recoveryPhrase(password)).split(' ').length, 24);
  const count = calls;
  await assert.rejects(wallet.createNew('testnet', password), /vault_exists/);
  assert.equal(calls, count);
});
