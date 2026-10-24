import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HybridWallet } from '../src/hybrid-wallet.ts';
import { createHybridVault, openHybridVault } from '../src/hybrid-vault.ts';
import { derivePublicWallet, generateWalletMnemonic, type PublicWallet } from '../src/core.ts';
import { publicWalletFingerprint } from '../src/recovery.ts';
import type { EnrollmentTransport, WalletEnrollment } from '../src/enrollment.ts';
import type { HybridVaultRecord, VaultTransport } from '../src/hybrid-wallet.ts';

/**
 * The lifecycle over the hybrid vault, with the transports mocked but the vault crypto real:
 * what reaches the "server" must be an envelope, never a seed, PIN or private key.
 */
const scope = { environment: 'development' as const, ownerId: 'owner-uuid', walletId: 'wallet-uuid' };
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const pub: PublicWallet = derivePublicWallet(phrase, 'testnet');
const share = 'a'.repeat(64);
const counter = () => { let n = 0; return (size: number) => { n += 1; return new Uint8Array(size).fill((n * 37) % 251 + 2); }; };

class MockVault implements VaultTransport {
  envelope: Awaited<ReturnType<typeof createHybridVault>> | null = null;
  version = 0;
  saved: Array<{ expectedVersion: number; proof: string; envelope: string }> = [];
  async load(proof: string): Promise<HybridVaultRecord> {
    if (proof !== 'unlock-proof' && proof !== 'sign-proof' && proof !== 'recover-proof') throw new Error('wallet_step_up_required');
    return { walletId: scope.walletId, version: this.version, serverShare: share, envelope: this.envelope };
  }
  async save(walletId: string, envelope: Awaited<ReturnType<typeof createHybridVault>>, expectedVersion: number, proof: string): Promise<void> {
    if (walletId !== scope.walletId) throw new Error('wallet_identity_changed');
    if (expectedVersion !== this.version) throw new Error('wallet_vault_conflict');
    this.saved.push({ expectedVersion, proof, envelope: JSON.stringify(envelope) });
    this.envelope = envelope;
    this.version += 1;
  }
}

const enrolled: WalletEnrollment = { scope, state: 'enrolled', operationId: null, network: null, wallet: null, setupEnabled: true };
const registered: WalletEnrollment = { ...enrolled, state: 'registered', operationId: 'op-uuid', network: 'testnet', wallet: pub };

const makeWallet = (row: WalletEnrollment, vault: MockVault, opts: {
  changeServerPin?: (next: string, current: string) => Promise<boolean>;
  resetServerPin?: (next: string, recoverProof: string) => Promise<void>;
} = {}) => {
  let current: WalletEnrollment = row;
  const enrollment: EnrollmentTransport = {
    async load() { return current; },
    async reserve(_walletId, operationId) { current = { ...enrolled, state: 'provisioning', operationId, network: 'testnet' }; return current; },
    async register(_walletId, _operationId, wallet) { current = { ...registered, wallet }; return current; },
  };
  return new HybridWallet({
    scope, enrollment, vault, random: counter(), newOperationId: () => 'op-uuid',
    proofs: { unlock: () => 'unlock-proof', sign: () => 'sign-proof' },
    changeServerPin: opts.changeServerPin ?? (async () => true),
    resetServerPin: opts.resetServerPin ?? (async () => {}),
  });
};

test('creates a wallet whose transports never see the seed or the PIN', async () => {
  const vault = new MockVault();
  const wallet = makeWallet(enrolled, vault);
  const created = await wallet.create('1234');
  assert.equal(created.row.state, 'registered');
  assert.equal(created.phrase.split(' ').length, 24); // 256-bit entropy: a 24-word phrase
  assert.equal(vault.saved.length, 1);
  assert.equal(vault.saved[0].expectedVersion, 0);
  const stored = vault.saved[0].envelope;
  assert.ok(!stored.includes(created.phrase));
  assert.ok(!stored.includes('1234'));
  assert.equal(JSON.parse(stored).format, 'hashpass-hybrid-vault');
  // The saved vault opens with the PIN + server share and matches the registered addresses.
  const opened = await openHybridVault(scope, vault.envelope!, '1234', share);
  assert.equal(opened.mnemonic, created.phrase);
  assert.equal(publicWalletFingerprint(created.row.wallet!), publicWalletFingerprint(derivePublicWallet(created.phrase, 'testnet')));
});

test('never replaces an existing vault: an interrupted creation opens the saved seed', async () => {
  const vault = new MockVault();
  vault.envelope = await createHybridVault(scope, phrase, 'testnet', '1234', share);
  vault.version = 1;
  const provisioning: WalletEnrollment = { ...enrolled, state: 'provisioning', operationId: 'op-uuid', network: 'testnet' };
  const created = await makeWallet(provisioning, vault).create('1234');
  assert.equal(created.phrase, phrase);
  assert.equal(vault.saved.length, 0);
});

test('refuses to mint a replacement wallet for a registered wallet whose vault is missing', async () => {
  const vault = new MockVault();
  await assert.rejects(makeWallet(registered, vault).create('1234'), /wallet_vault_missing/);
  assert.equal(vault.saved.length, 0);
});

test('reveals the phrase only through the envelope', async () => {
  const vault = new MockVault();
  vault.envelope = await createHybridVault(scope, phrase, 'testnet', '1234', share);
  vault.version = 1;
  const wallet = makeWallet(registered, vault);
  await assert.rejects(wallet.reveal('9999'), /vault_unlock_failed/);
  assert.equal(await wallet.reveal('1234'), phrase);
});

test('changes the PIN by re-wrapping the same seed; the old PIN stops working', async () => {
  const vault = new MockVault();
  vault.envelope = await createHybridVault(scope, phrase, 'testnet', '1234', share);
  vault.version = 1;
  const seedCiphertext = vault.envelope!.ciphertext;
  const changes: string[] = [];
  const wallet = makeWallet(registered, vault, { changeServerPin: async next => { changes.push(next); return true; } });
  await wallet.changePin('1234', '5678');
  assert.deepEqual(changes, ['5678']);
  // Only the key wrap changed; the encrypted seed bytes are untouched.
  assert.equal(vault.envelope!.ciphertext, seedCiphertext);
  assert.equal((await openHybridVault(scope, vault.envelope!, '5678', share)).mnemonic, phrase);
  await assert.rejects(openHybridVault(scope, vault.envelope!, '1234', share), /vault_unlock_failed/);
});

test('puts the vault back if the server refuses the verifier change', async () => {
  const vault = new MockVault();
  vault.envelope = await createHybridVault(scope, phrase, 'testnet', '1234', share);
  vault.version = 1;
  const wallet = makeWallet(registered, vault, { changeServerPin: async () => false });
  await assert.rejects(wallet.changePin('1234', '5678'), /wallet_pin_change_failed/);
  assert.equal((await openHybridVault(scope, vault.envelope!, '1234', share)).mnemonic, phrase);
  await assert.rejects(openHybridVault(scope, vault.envelope!, '5678', share), /vault_unlock_failed/);
});

test('keeps the vault on the new PIN when the verifier change outcome is unknown', async () => {
  const vault = new MockVault();
  vault.envelope = await createHybridVault(scope, phrase, 'testnet', '1234', share);
  vault.version = 1;
  // A lost response, not a rejection: the server may have committed the new verifier. Rolling
  // the envelope back could then strand the pair (verifier `5678`, envelope `1234`).
  const wallet = makeWallet(registered, vault, {
    changeServerPin: async () => { throw new Error('network down'); },
  });
  await assert.rejects(wallet.changePin('1234', '5678'), /wallet_pin_change_unknown/);
  assert.equal((await openHybridVault(scope, vault.envelope!, '5678', share)).mnemonic, phrase);
  // Exactly one save (the re-wrap): the restore path never ran.
  assert.equal(vault.saved.length, 1);
});

test('recovers with the right phrase and rejects a wrong one before anything is saved', async () => {
  const vault = new MockVault();
  vault.envelope = await createHybridVault(scope, phrase, 'testnet', '1234', share);
  vault.version = 1;
  const resets: string[] = [];
  const wallet = makeWallet(registered, vault, { resetServerPin: async next => { resets.push(next); } });
  const wrong = generateWalletMnemonic();
  await assert.rejects(wallet.recover(wrong, '5678', 'recover-proof'), /wallet_recovery_mismatch/);
  assert.equal(vault.saved.length, 0);
  assert.deepEqual(resets, []);
  await wallet.recover(phrase, '5678', 'recover-proof');
  assert.deepEqual(resets, ['5678']);
  assert.equal((await openHybridVault(scope, vault.envelope!, '5678', share)).mnemonic, phrase);
});

test('imports an external BIP-39 phrase: same seed, wrapped like a generated wallet, server never sees it', async () => {
  const vault = new MockVault();
  const wallet = makeWallet(enrolled, vault);
  // A 12-word phrase from an external wallet (any BIP-39 wallet export) — imported verbatim.
  const imported = await wallet.importPhrase(phrase, '1234');
  assert.equal(imported.row.state, 'registered');
  // The registered addresses are derived from the imported seed: same Ethereum/Bitcoin/Solana
  // accounts the original wallet shows for these standard paths.
  assert.equal(publicWalletFingerprint(imported.row.wallet!), publicWalletFingerprint(derivePublicWallet(phrase, 'testnet')));
  assert.equal(vault.saved.length, 1);
  assert.equal(vault.saved[0].expectedVersion, 0);
  const stored = vault.saved[0].envelope;
  assert.ok(!stored.includes(phrase));
  assert.ok(!stored.includes('1234'));
  // The vault opens with the PIN + server share and holds the imported seed, unchanged.
  assert.equal((await openHybridVault(scope, vault.envelope!, '1234', share)).mnemonic, phrase);
  assert.equal(await wallet.reveal('1234'), phrase);
});

test('rejects an invalid import phrase before anything is reserved or saved', async () => {
  const vault = new MockVault();
  const wallet = makeWallet(enrolled, vault);
  await assert.rejects(wallet.importPhrase('not a real recovery phrase at all', '1234'), /invalid_mnemonic/);
  // Eleven words: a valid word list but an impossible BIP-39 length.
  await assert.rejects(wallet.importPhrase('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon', '1234'), /invalid_mnemonic/);
  assert.equal(vault.saved.length, 0);
});

test('never lets an import replace an existing wallet, whether registered or saved as a vault', async () => {
  const registeredVault = new MockVault();
  await assert.rejects(makeWallet(registered, registeredVault).importPhrase(phrase, '1234'), /wallet_vault_exists/);
  assert.equal(registeredVault.saved.length, 0);

  // An interrupted creation left a saved envelope: an import cannot overwrite it either.
  const interruptedVault = new MockVault();
  interruptedVault.envelope = await createHybridVault(scope, phrase, 'testnet', '1234', share);
  interruptedVault.version = 1;
  const provisioning: WalletEnrollment = { ...enrolled, state: 'provisioning', operationId: 'op-uuid', network: 'testnet' };
  await assert.rejects(makeWallet(provisioning, interruptedVault).importPhrase(generateWalletMnemonic(), '5678'), /wallet_vault_exists/);
  // The original envelope is untouched.
  assert.equal((await openHybridVault(scope, interruptedVault.envelope!, '1234', share)).mnemonic, phrase);
});
