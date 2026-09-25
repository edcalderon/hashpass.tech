import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePublicWallet } from '../src/core.ts';
import { parsePublicWallet } from '../src/manifest.ts';
const wallet = derivePublicWallet('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', 'testnet');
test('public metadata accepts only the primary manifest and valid chain addresses', () => {
  assert.deepEqual(parsePublicWallet(wallet), wallet);
  for (const invalid of [null, { ...wallet, mnemonic: 'must never store' }, { ...wallet, accountIndex: 1 },
    { ...wallet, bitcoin: { ...wallet.bitcoin, address: wallet.bitcoin.address.slice(0, -1) + 'x' } },
    { ...wallet, solana: { ...wallet.solana, address: 'fake' } },
    { ...wallet, ethereum: { ...wallet.ethereum, path: "m/1'" } },
    { ...wallet, ethereum: { ...wallet.ethereum, privateKey: 'no' } },
    { ...wallet, network: 'mainnet' }]) assert.throws(() => parsePublicWallet(invalid));
});
