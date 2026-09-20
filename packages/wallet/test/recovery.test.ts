import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportRecoveryBackup, importRecoveryBackup, createRecoveryChallenge } from '../src/recovery.ts';
import { derivePublicWallet } from '../src/core.ts';
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const password = 'public backup password only';

test('portable backup restores the same three addresses without leaking account identifiers', async () => {
  const backup = await exportRecoveryBackup(phrase, 'testnet', password);
  assert.ok(!backup.includes('abandon'));
  assert.equal(JSON.parse(backup).format, 'hashpass-recovery');
  const restored = await importRecoveryBackup(backup, password);
  assert.equal(restored.mnemonic, phrase);
  assert.deepEqual(restored.wallet, derivePublicWallet(phrase, 'testnet'));
  await assert.rejects(importRecoveryBackup(backup, 'wrong backup password only'));
  await assert.rejects(importRecoveryBackup(JSON.stringify({ version: 3, crypto: {} }), password));
});

test('backup verification rejects a different wallet or network', async () => {
  const backup = await exportRecoveryBackup(phrase, 'testnet', password);
  await assert.rejects(importRecoveryBackup(backup, password, derivePublicWallet(phrase, 'mainnet')));
  await assert.rejects(importRecoveryBackup(backup, password, derivePublicWallet(phrase, 'testnet', 1)));
});

test('phrase challenge chooses distinct positions and requires correct answers before completion', () => {
  const challenge = createRecoveryChallenge(phrase);
  assert.equal(challenge.positions.length, 3);
  assert.equal(new Set(challenge.positions).size, 3);
  assert.equal(challenge.verify(['bad', 'bad', 'bad']), false);
  assert.equal(challenge.verify(challenge.positions.map((p: number) => phrase.split(' ')[p])), true);
  challenge.dispose();
  assert.equal(challenge.verify(challenge.positions.map((p: number) => phrase.split(' ')[p])), false);
  assert.ok(!JSON.stringify(challenge).includes('abandon'));
});
