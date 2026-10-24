import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportRecoveryBackup,
  importRecoveryBackup,
  exportPinRecoveryBackup,
  importPinRecoveryBackup,
  generateRecoveryPassword,
  createRecoveryChallenge,
} from '../src/recovery.ts';
import { derivePublicWallet } from '../src/core.ts';
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const password = 'public backup password only';
const pin = '4821';
const serverShare = 'a'.repeat(64);

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

test('PIN backup uses the Hashpass server share without putting the share in the file', async () => {
  const backup = await exportPinRecoveryBackup(phrase, 'testnet', pin, serverShare);
  const parsed = JSON.parse(backup);
  assert.equal(parsed.format, 'hashpass-recovery-pin');
  assert.ok(!backup.includes(phrase));
  assert.ok(!backup.includes(serverShare));
  assert.equal((await importPinRecoveryBackup(backup, pin, serverShare)).mnemonic, phrase);
  await assert.rejects(importPinRecoveryBackup(backup, '0000', serverShare));
  await assert.rejects(importPinRecoveryBackup(backup, pin, 'b'.repeat(64)));
});

test('generated recovery passwords are long, non-numeric and contain varied characters', () => {
  const password = generateRecoveryPassword(size => new Uint8Array(size).map((_, index) => (index * 37 + 11) & 0xff));
  assert.equal(password.length, 32);
  assert.match(password, /[A-Za-z]/);
  assert.ok(new Set(password).size >= 8);
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
