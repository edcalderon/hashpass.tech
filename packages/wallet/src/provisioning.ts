import { publicWalletFingerprint } from './recovery';
import { validateWalletPassword } from './vault';
import type { LocalWallet } from './local-wallet';
import type { WalletEnrollment, EnrollmentTransport } from './enrollment';

/** Coordinates public metadata only. API calls never receive a password, seed,
 * challenge answer or encrypted recovery file. New IDs come from platform CSPRNG. */
export class WalletProvisioning {
  private epoch = 0;
  private busy = false;
  private scope: WalletEnrollment['scope'];
  constructor(initial: WalletEnrollment, private local: LocalWallet,
    private api: EnrollmentTransport, private newOperationId: () => string) {
    this.scope = Object.freeze({ ...initial.scope });
  }
  lock(): void { this.epoch++; this.local.lock(); }
  private check(epoch: number): void { if (epoch !== this.epoch) throw new Error('wallet_locked'); }
  private owned(row: WalletEnrollment): WalletEnrollment {
    if (row.scope.ownerId !== this.scope.ownerId || row.scope.walletId !== this.scope.walletId ||
        row.scope.environment !== this.scope.environment) throw new Error('wallet_identity_changed');
    return row;
  }
  async provision(password: string): Promise<WalletEnrollment> {
    if (this.busy) throw new Error('wallet_busy');
    this.busy = true; const epoch = this.epoch;
    try {
      validateWalletPassword(password);
      let row = this.owned(await this.api.load()); this.check(epoch);
      if (!row.setupEnabled || row.scope.environment !== 'development') throw new Error('wallet_setup_disabled');
      const exists = await this.local.exists(); this.check(epoch);
      if (!exists && row.state === 'registered') throw new Error('wallet_recovery_required');
      if (exists && row.state === 'enrolled') throw new Error('wallet_metadata_conflict');
      let wallet;
      if (exists) {
        wallet = await this.local.unlock(password); this.check(epoch);
      } else {
        const operationId = await this.local.reservationOperation(row.state === 'enrolled' ? this.newOperationId() : undefined); this.check(epoch);
        if (!operationId || (row.state === 'provisioning' && row.operationId !== operationId)) throw new Error('wallet_setup_interrupted');
        row = this.owned(await this.api.reserve(this.scope.walletId, operationId)); this.check(epoch);
        if (row.state !== 'provisioning' || row.network !== 'testnet' || row.operationId !== operationId) throw new Error('wallet_metadata_conflict');
        await this.local.claimReservation(operationId); this.check(epoch);
        wallet = await this.local.createNew(row.network, password); this.check(epoch);
      }
      if (row.wallet) {
        if (publicWalletFingerprint(wallet) !== publicWalletFingerprint(row.wallet)) throw new Error('wallet_metadata_conflict');
        return row;
      }
      if (!row.operationId || row.network !== wallet.network) throw new Error('wallet_metadata_conflict');
      const registered = this.owned(await this.api.register(this.scope.walletId, row.operationId, wallet)); this.check(epoch);
      if (registered.state !== 'registered' || !registered.wallet ||
          publicWalletFingerprint(registered.wallet) !== publicWalletFingerprint(wallet)) throw new Error('wallet_metadata_conflict');
      return registered;
    } finally { this.busy = false; }
  }
}
