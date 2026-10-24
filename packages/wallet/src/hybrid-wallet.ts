import { derivePublicWallet, generateWalletMnemonic, normalizeMnemonic, type PublicWallet, type SecureRandom } from './core';
import { createHybridVault, openHybridVault, rewrapHybridVault } from './hybrid-vault';
import type { HybridVaultEnvelope } from './hybrid-vault.types';
import { publicWalletFingerprint } from './recovery';
import type { VaultScope } from './vault';
import type { EnrollmentTransport, WalletEnrollment } from './enrollment';
import type { HybridVaultRecord, VaultTransport, HybridWalletDeps, CreatedWallet } from './hybrid-wallet.types';
export type { HybridVaultRecord, VaultTransport, HybridWalletDeps, CreatedWallet } from './hybrid-wallet.types';

const need = (proof: string | null, error: string): string => { if (!proof) throw new Error(error); return proof; };

/**
 * Wallet lifecycle over the hybrid vault. The seed exists in plaintext only inside these calls
 * and the phrase screen; the device keeps no copy. What the server stores is the envelope: the
 * seed under a random key, that key wrapped by (PIN + a server share released only after a PIN
 * proof). The PIN digits are handed in per call and never retained.
 */
export class HybridWallet {
  constructor(private readonly d: HybridWalletDeps) {}

  private owned(row: WalletEnrollment): WalletEnrollment {
    const a = row.scope, b = this.d.scope;
    if (a.ownerId !== b.ownerId || a.walletId !== b.walletId || a.environment !== b.environment) throw new Error('wallet_identity_changed');
    return row;
  }

  /** Creates the wallet, or finishes an interrupted creation. Needs fresh `wallet:sign` and `wallet:unlock` proofs. */
  async create(pin: string): Promise<CreatedWallet> {
    const unlock = need(this.d.proofs.unlock(), 'wallet_step_up_required');
    let row = this.owned(await this.d.enrollment.load());
    if (!row.setupEnabled || row.scope.environment !== 'development') throw new Error('wallet_setup_disabled');
    const vault = await this.d.vault.load(unlock);
    if (row.state === 'registered' && !vault.envelope) throw new Error('wallet_vault_missing');
    if (row.state === 'enrolled') {
      need(this.d.proofs.sign(), 'wallet_step_up_required');
      row = this.owned(await this.d.enrollment.reserve(this.d.scope.walletId, this.d.newOperationId()));
    }
    if (row.state === 'enrolled' || !row.operationId || row.network !== 'testnet') throw new Error('wallet_metadata_conflict');

    let phrase: string;
    if (vault.envelope) {
      // A vault already exists (earlier attempt, or a finished wallet): never overwrite it. Open it.
      phrase = (await openHybridVault(this.d.scope, vault.envelope, pin, vault.serverShare)).mnemonic;
    } else {
      phrase = generateWalletMnemonic(this.d.random);
      const envelope = await createHybridVault(this.d.scope, phrase, row.network, pin, vault.serverShare, this.d.random);
      // Persist the encrypted seed BEFORE registering addresses, so a registered wallet always has a vault.
      await this.d.vault.save(this.d.scope.walletId, envelope, 0, unlock);
    }
    if (row.state === 'registered') return { phrase, row };
    const pub: PublicWallet = derivePublicWallet(phrase, row.network);
    const registered = this.owned(await this.d.enrollment.register(this.d.scope.walletId, row.operationId, pub));
    if (registered.state !== 'registered' || !registered.wallet ||
        publicWalletFingerprint(registered.wallet) !== publicWalletFingerprint(pub)) throw new Error('wallet_metadata_conflict');
    return { phrase, row: registered };
  }

  /**
   * Imports a phrase created outside HASHPASS (any BIP-39 wallet: MetaMask, Trust, Ledger,
   * Phantom…). Compatibility lives at the mnemonic level — the same BIP-39 seed derives the
   * standard Ethereum (m/44'/60'), native-segwit Bitcoin (m/84') and Solana (m/44'/501')
   * accounts other wallets show. Only possible while the account has NO wallet at all: an
   * existing vault or registered addresses are never replaced by an import. The imported seed
   * is wrapped into the same hybrid envelope as a generated one, so it is PIN-encrypted and the
   * original phrase keeps working in the wallet it came from. Needs fresh `wallet:sign` and
   * `wallet:unlock` proofs.
   */
  async importPhrase(phraseInput: string, pin: string): Promise<CreatedWallet> {
    const phrase = normalizeMnemonic(phraseInput.toLowerCase());
    const unlock = need(this.d.proofs.unlock(), 'wallet_step_up_required');
    let row = this.owned(await this.d.enrollment.load());
    if (!row.setupEnabled || row.scope.environment !== 'development') throw new Error('wallet_setup_disabled');
    const vault = await this.d.vault.load(unlock);
    if (vault.envelope || row.state !== 'enrolled') throw new Error('wallet_vault_exists');
    need(this.d.proofs.sign(), 'wallet_step_up_required');
    row = this.owned(await this.d.enrollment.reserve(this.d.scope.walletId, this.d.newOperationId()));
    if (row.state === 'enrolled' || !row.operationId || row.network !== 'testnet') throw new Error('wallet_metadata_conflict');
    const envelope = await createHybridVault(this.d.scope, phrase, row.network, pin, vault.serverShare, this.d.random);
    // Persist the encrypted seed BEFORE registering addresses, exactly like a fresh create.
    await this.d.vault.save(this.d.scope.walletId, envelope, 0, unlock);
    const pub: PublicWallet = derivePublicWallet(phrase, row.network);
    const registered = this.owned(await this.d.enrollment.register(this.d.scope.walletId, row.operationId, pub));
    if (registered.state !== 'registered' || !registered.wallet ||
        publicWalletFingerprint(registered.wallet) !== publicWalletFingerprint(pub)) throw new Error('wallet_metadata_conflict');
    return { phrase, row: registered };
  }

  /** Decrypts the phrase for display/download. The caller must have just verified `pin` for `wallet:unlock`. */
  async reveal(pin: string): Promise<string> {
    const vault = await this.d.vault.load(need(this.d.proofs.unlock(), 'wallet_step_up_required'));
    if (!vault.envelope) throw new Error('wallet_vault_missing');
    return (await openHybridVault(this.d.scope, vault.envelope, pin, vault.serverShare)).mnemonic;
  }

  /**
   * Re-wraps the same key for the new PIN (the encrypted seed is untouched), then replaces the
   * server verifier. The two writes are reconciled before the envelope is ever rolled back:
   * `changeServerPin` resolves false ONLY for an authoritative rejection (the server answered
   * and kept the old verifier) and throws when its outcome is unknown (the response was lost,
   * so the server may have committed). Needs fresh `wallet:unlock` and `wallet:sign` proofs
   * minted with the CURRENT pin.
   */
  async changePin(current: string, next: string): Promise<void> {
    if (current === next) throw new Error('pin_unchanged');
    const unlock = need(this.d.proofs.unlock(), 'wallet_step_up_required');
    const vault = await this.d.vault.load(unlock);
    if (!vault.envelope) throw new Error('wallet_vault_missing');
    const rewrapped = await rewrapHybridVault(this.d.scope, vault.envelope, current, next, vault.serverShare, this.d.random);
    await this.d.vault.save(this.d.scope.walletId, rewrapped, vault.version, need(this.d.proofs.sign(), 'wallet_step_up_required'));
    let unknown = false;
    try {
      if (await this.d.changeServerPin(next, current)) return;
    } catch { unknown = true; }
    if (unknown) {
      // The envelope is on `next` and the verifier may already be too: rolling the envelope
      // back here is the one move that can strand the pair (verifier `next`, envelope
      // `current`) with no PIN that opens both. Leave it on `next`: if the server committed,
      // the wallet simply works with the new PIN; if it did not, the email-code recovery
      // rebuilds the vault from the phrase.
      throw new Error('wallet_pin_change_unknown');
    }
    // An authoritative rejection: the verifier is still `current`, so put the envelope back.
    try {
      const restored = await rewrapHybridVault(this.d.scope, rewrapped, next, current, vault.serverShare, this.d.random);
      await this.d.vault.save(this.d.scope.walletId, restored, vault.version + 1, need(this.d.proofs.sign(), 'wallet_step_up_required'));
    } catch { /* the recovery flow (email code + phrase) rebuilds the vault from the phrase */ }
    throw new Error('wallet_pin_change_failed');
  }

  /**
   * Forgotten PIN: the email code produced `recoverProof`; the recovery phrase proves ownership
   * and rebuilds the vault for the new PIN. The phrase must match the registered public addresses,
   * so a wrong phrase cannot replace anyone's vault.
   */
  async recover(phraseInput: string, next: string, recoverProof: string): Promise<void> {
    const row = this.owned(await this.d.enrollment.load());
    if (row.state !== 'registered' || !row.wallet || !row.network) throw new Error('wallet_recovery_unavailable');
    const phrase = normalizeMnemonic(phraseInput.toLowerCase());
    const pub: PublicWallet = derivePublicWallet(phrase, row.network);
    if (publicWalletFingerprint(pub) !== publicWalletFingerprint(row.wallet)) throw new Error('wallet_recovery_mismatch');
    const vault = await this.d.vault.load(recoverProof);
    const envelope = await createHybridVault(this.d.scope, phrase, row.network, next, vault.serverShare, this.d.random);
    await this.d.vault.save(this.d.scope.walletId, envelope, vault.version, recoverProof);
    await this.d.resetServerPin(next, recoverProof);
  }
}
