import { derivePublicWallet, generateWalletMnemonic, secureRandom, type PublicWallet, type SecureRandom, type WalletNetwork } from './core';
import { decryptVault, encryptVault, validateWalletPassword, vaultStorageKey, type VaultContents, type VaultScope } from './vault';
import type { VaultStore } from './storage';
import { exportRecoveryBackup, importRecoveryBackup } from './recovery';

/** Device-local encrypted wallet. No unlocked mnemonic/password is cached on
 * the instance. Every sensitive operation re-authenticates. lock() invalidates
 * in-flight results on logout/background; it never deletes persisted keys. */
export class LocalWallet {
  private readonly scope: VaultScope;
  private readonly key: string;
  private epoch = 0;
  constructor(scope: VaultScope, private readonly store: VaultStore, private readonly random: SecureRandom = secureRandom) {
    this.scope = Object.freeze({ ...scope });
    this.key = vaultStorageKey(this.scope);
  }
  lock(): void { this.epoch += 1; }
  private check(epoch: number): void {
    if (epoch !== this.epoch) throw new Error('wallet_locked');
  }
  async exists(): Promise<boolean> { return (await this.store.read(this.key)) !== null; }

  async createNew(network: WalletNetwork, password: string): Promise<PublicWallet> {
    const epoch = this.epoch;
    validateWalletPassword(password);
    if (await this.exists()) throw new Error('vault_exists');
    this.check(epoch);
    return this.create(generateWalletMnemonic(this.random), network, password);
  }

  async create(phrase: string, network: WalletNetwork, password: string): Promise<PublicWallet> {
    const epoch = this.epoch;
    if (await this.store.read(this.key) !== null) throw new Error('vault_exists');
    this.check(epoch);
    const publicWallet = derivePublicWallet(phrase, network);
    const blob = await encryptVault(this.scope, phrase, network, password, this.random);
    this.check(epoch);
    if (!await this.store.compareAndSwap(this.key, null, blob)) throw new Error('vault_exists');
    this.check(epoch);
    // Persistence may have succeeded immediately before a lock. Retain the
    // wallet for next-session recovery; never roll back/delete a durable seed.
    return publicWallet;
  }

  private async read(password: string, epoch: number): Promise<{ blob: string; contents: VaultContents }> {
    const blob = await this.store.read(this.key);
    this.check(epoch);
    if (blob === null) throw new Error('vault_missing');
    const contents = await decryptVault(this.scope, blob, password);
    this.check(epoch);
    if (await this.store.read(this.key) !== blob) throw new Error('vault_changed');
    this.check(epoch);
    return { blob, contents };
  }

  /** Successful unlock returns public metadata only, not a signing capability. */
  async unlock(password: string): Promise<PublicWallet> {
    const epoch = this.epoch;
    const { contents } = await this.read(password, epoch);
    const result = derivePublicWallet(contents.mnemonic, contents.network);
    this.check(epoch);
    return result;
  }

  /** Explicit recovery reveal. Caller must clear the displayed phrase on hide,
   * background, navigation and account change; never log or auto-copy it. */
  async recoveryPhrase(password: string): Promise<string> {
    const epoch = this.epoch;
    const { contents } = await this.read(password, epoch);
    this.check(epoch);
    return contents.mnemonic;
  }

  async exportBackup(walletPassword: string, backupPassword: string): Promise<string> {
    const epoch = this.epoch;
    const { contents } = await this.read(walletPassword, epoch);
    const backup = await exportRecoveryBackup(contents.mnemonic, contents.network, backupPassword, this.random);
    this.check(epoch);
    return backup;
  }

  async restore(backup: string, backupPassword: string, walletPassword: string, expected: PublicWallet): Promise<PublicWallet> {
    const epoch = this.epoch;
    if (!expected) throw new Error('recovery_identity_required');
    if (await this.exists()) throw new Error('vault_exists');
    this.check(epoch);
    const recovered = await importRecoveryBackup(backup, backupPassword, expected);
    this.check(epoch);
    return this.create(recovered.mnemonic, recovered.wallet.network, walletPassword);
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const epoch = this.epoch;
    const { blob, contents } = await this.read(oldPassword, epoch);
    const replacement = await encryptVault(this.scope, contents.mnemonic, contents.network, newPassword, this.random);
    this.check(epoch);
    if (!await this.store.compareAndSwap(this.key, blob, replacement)) throw new Error('vault_changed');
    this.check(epoch);
    this.lock();
  }
}
