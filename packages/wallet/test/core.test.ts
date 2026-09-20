import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePublicWallet, generateWalletMnemonic, normalizeMnemonic } from '../src/core.ts';

// PUBLIC BIP-39/BIP-84 test vector. Never fund these accounts.
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('derives interoperable Ethereum and BIP-84 Bitcoin first accounts', () => {
  const wallet = derivePublicWallet(phrase, 'mainnet');
  assert.equal(wallet.version, 1);
  assert.equal(wallet.ethereum.address, '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  assert.equal(wallet.ethereum.path, "m/44'/60'/0'/0/0");
  assert.equal(wallet.bitcoin.address, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  assert.equal(wallet.bitcoin.path, "m/84'/0'/0'/0/0");
  assert.equal(wallet.solana.path, "m/44'/501'/0'/0'");
  assert.equal(Object.keys(wallet.solana).sort().join(','), 'address,path');
  assert.ok(!/private|secret|mnemonic|chainCode|seed|xpriv/i.test(JSON.stringify(wallet)));
});

test('network selection is explicit and Bitcoin testnet uses coin type 1', () => {
  const wallet = derivePublicWallet(phrase, 'testnet');
  assert.equal(wallet.bitcoin.path, "m/84'/1'/0'/0/0");
  assert.match(wallet.bitcoin.address, /^tb1q/);
  assert.notEqual(wallet.bitcoin.address, derivePublicWallet(phrase, 'mainnet').bitcoin.address);
  assert.throws(() => derivePublicWallet(phrase, undefined as never));
});

test('normalizes phrase whitespace but rejects bad checksums and unsafe indices', () => {
  assert.equal(normalizeMnemonic(`  ${phrase.replaceAll(' ', '  ')}\n`), phrase);
  assert.throws(() => derivePublicWallet(phrase.replace('about', 'abandon'), 'mainnet'));
  for (const index of [-1, 0.5, NaN, Infinity, 2 ** 31]) {
    assert.throws(() => derivePublicWallet(phrase, 'mainnet', index));
  }
  assert.notEqual(derivePublicWallet(phrase, 'mainnet', 1).ethereum.address,
    derivePublicWallet(phrase, 'mainnet').ethereum.address);
});

test('generates 24 words from 256 bits and fails without a working secure RNG', () => {
  // Deterministic entropy is ONLY supplied by this public-vector test.
  assert.equal(generateWalletMnemonic(size => new Uint8Array(size)).split(' ').length, 24);
  assert.throws(() => generateWalletMnemonic(() => { throw new Error('RNG unavailable'); }));
  assert.throws(() => generateWalletMnemonic(() => new Uint8Array(0)));
});

test('Solana derivation matches an independent Node crypto SLIP-0010 calculation', async () => {
  const { createHmac, pbkdf2Sync, createPrivateKey, createPublicKey } = await import('node:crypto');
  const { base58 } = await import('@scure/base');
  const seed = pbkdf2Sync(phrase, 'mnemonic', 2048, 64, 'sha512');
  let node = createHmac('sha512', 'ed25519 seed').update(seed).digest();
  for (const index of [44, 501, 0, 0]) {
    const child = Buffer.alloc(37);
    node.copy(child, 1, 0, 32);
    child.writeUInt32BE(index + 0x80000000, 33);
    node = createHmac('sha512', node.subarray(32)).update(child).digest();
  }
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), node.subarray(0, 32)]);
  const publicKey = createPublicKey(createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' }))
    .export({ format: 'der', type: 'spki' });
  assert.equal(derivePublicWallet(phrase, 'mainnet').solana.address, base58.encode(publicKey.subarray(-32)));
});
