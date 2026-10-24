import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHybridVault, openHybridVault, rewrapHybridVault, readHybridEnvelope, generateDek } from '../src/hybrid-vault.ts';
import type { VaultScope } from '../src/vault.ts';

const scope: VaultScope = { environment: 'development', ownerId: 'user-a', walletId: 'wallet-a' };
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const share = 'a'.repeat(64);
const otherShare = 'b'.repeat(64);

test('round-trips with the PIN and server share, never serializing plaintext', async () => {
  const envelope = await createHybridVault(scope, phrase, 'testnet', '4821', share);
  assert.ok(!JSON.stringify(envelope).includes('abandon'));
  assert.deepEqual(await openHybridVault(scope, JSON.stringify(envelope), '4821', share), { mnemonic: phrase, network: 'testnet' });
  assert.notEqual(JSON.stringify(envelope), JSON.stringify(await createHybridVault(scope, phrase, 'testnet', '4821', share)));
});

test('needs BOTH the right PIN and the server share', async () => {
  const envelope = await createHybridVault(scope, phrase, 'testnet', '4821', share);
  await assert.rejects(openHybridVault(scope, envelope, '4822', share), /vault_unlock_failed/);
  await assert.rejects(openHybridVault(scope, envelope, '4821', otherShare), /vault_unlock_failed/);
});

test('is bound to owner, wallet and environment, and rejects tampering', async () => {
  const envelope = await createHybridVault(scope, phrase, 'testnet', '4821', share);
  for (const altered of [{ ...scope, ownerId: 'user-b' }, { ...scope, walletId: 'wallet-b' }, { ...scope, environment: 'production' as const }]) {
    await assert.rejects(openHybridVault(altered, envelope, '4821', share));
  }
  const swapped = { ...envelope, ciphertext: (envelope.ciphertext[0] === 'a' ? 'b' : 'a') + envelope.ciphertext.slice(1) };
  await assert.rejects(openHybridVault(scope, swapped, '4821', share));
});

test('rejects malformed envelopes, PINs and shares before any expensive work', async () => {
  const envelope = await createHybridVault(scope, phrase, 'testnet', '4821', share);
  for (const patch of [{ version: 9 }, { iterations: 1 }, { salt: '' }, { wrappedDek: 'x' }, { algorithm: 'none' }]) {
    assert.throws(() => readHybridEnvelope({ ...envelope, ...patch }), /invalid_vault/);
  }
  assert.throws(() => readHybridEnvelope('x'.repeat(9000)), /invalid_vault/);
  await assert.rejects(createHybridVault(scope, phrase, 'testnet', '12a4', share), /invalid_pin/);
  await assert.rejects(createHybridVault(scope, phrase, 'testnet', '4821', 'short'), /invalid_server_share/);
  assert.equal(generateDek().length, 32);
});

test('PIN change re-wraps the same seed for the new PIN only', async () => {
  const envelope = await createHybridVault(scope, phrase, 'testnet', '4821', share);
  const next = await rewrapHybridVault(scope, envelope, '4821', '9034', share);
  assert.equal(next.ciphertext, envelope.ciphertext);
  assert.equal((await openHybridVault(scope, next, '9034', share)).mnemonic, phrase);
  await assert.rejects(openHybridVault(scope, next, '4821', share));
  await assert.rejects(rewrapHybridVault(scope, envelope, '0000', '9034', share));
});
