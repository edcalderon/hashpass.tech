import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redirectWalletShare } from './wallet-share';

test('wallet share links redirect to the network-specific explorer', async () => {
  const response = await redirectWalletShare(
    new Request('https://hpass.id/w/testnet/ethereum/0x0000000000000000000000000000000000000001'),
    'testnet',
    'ethereum',
    '0x0000000000000000000000000000000000000001',
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://sepolia.etherscan.io/address/0x0000000000000000000000000000000000000001');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});

test('wallet share links never accept malformed or unsupported addresses', async () => {
  const malformed = await redirectWalletShare(new Request('https://hpass.id/'), 'mainnet', 'ethereum', 'private-key');
  assert.equal(malformed.status, 404);
  const unsupported = await redirectWalletShare(new Request('https://hpass.id/'), 'testnet', 'dogecoin', 'abc');
  assert.equal(unsupported.status, 404);
});
