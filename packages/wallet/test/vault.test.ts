import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptVault, decryptVault, vaultStorageKey, type VaultScope } from '../src/vault.ts';
const scope: VaultScope = { environment: 'development', ownerId: 'user-a', walletId: 'wallet-a' };
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const password = 'public test password only';

test('authenticated vault round-trips without serializing plaintext or password', async () => {
  const blob = await encryptVault(scope, phrase, 'testnet', password);
  assert.ok(!blob.includes('abandon') && !blob.includes(password));
  const recovered = await decryptVault(scope, blob, password);
  assert.equal(recovered.mnemonic, phrase);
  assert.equal(recovered.network, 'testnet');
  await assert.rejects(decryptVault(scope, blob, 'wrong password but long enough'));
  const second = await encryptVault(scope, phrase, 'testnet', password);
  assert.notEqual(blob, second);
});

test('rejects owner/environment/wallet substitution and tampered ciphertext', async () => {
  const blob = await encryptVault(scope, phrase, 'testnet', password);
  for (const altered of [{ ...scope, ownerId: 'user-b' }, { ...scope, walletId: 'wallet-b' },
    { ...scope, environment: 'production' as const }]) {
    await assert.rejects(decryptVault(altered, blob, password));
  }
  const data = JSON.parse(blob);
  data.ciphertext = (data.ciphertext[0] === 'a' ? 'b' : 'a') + data.ciphertext.slice(1);
  await assert.rejects(decryptVault(scope, JSON.stringify(data), password));
});

test('rejects malformed or attacker-controlled KDF parameters before expensive work', async () => {
  const blob = await encryptVault(scope, phrase, 'testnet', password);
  for (const patch of [{ version: 9 }, { iterations: 1 }, { iterations: 2 ** 32 },
    { salt: '' }, { iv: 'bad' }, { algorithm: 'none' }]) {
    await assert.rejects(decryptVault(scope, JSON.stringify({ ...JSON.parse(blob), ...patch }), password));
  }
  await assert.rejects(decryptVault(scope, 'x'.repeat(20_000), password));
  await assert.rejects(encryptVault(scope, phrase, 'testnet', '1234'));
});

test('storage identity is scoped without separator collisions', () => {
  assert.notEqual(vaultStorageKey(scope), vaultStorageKey({ ...scope, ownerId: 'user-b' }));
  assert.notEqual(vaultStorageKey(scope), vaultStorageKey({ ...scope, environment: 'production' }));
  assert.throws(() => vaultStorageKey({ ...scope, ownerId: '' }));
  assert.throws(() => vaultStorageKey({ ...scope, ownerId: '../user' }));
});

test('malformed identity values cannot be coerced to valid scope strings', () => {
  for (const ownerId of [undefined, null, 123]) {
    assert.throws(() => vaultStorageKey({ ...scope, ownerId } as never));
  }
});
