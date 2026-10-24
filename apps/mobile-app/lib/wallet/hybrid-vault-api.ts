import { readHybridEnvelope, type HybridVaultEnvelope } from '@hashpass/wallet';
import { apiClient } from '../api-client';
import { STEP_UP_HEADER } from '../step-up-session';
import type { VaultEnvelope } from './hybrid-vault-api.types';
export type { VaultEnvelope } from './hybrid-vault-api.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (status?: number) => new Error(status === 403 ? 'wallet_step_up_required' : status === 409 ? 'wallet_vault_conflict' : 'wallet_vault_unavailable');

export const hybridVaultClient = {
  async load(unlockProof: string): Promise<VaultEnvelope> {
    const result = await apiClient.get('/wallet/vault', { skipEventSegment: true, retries: 0, headers: { [STEP_UP_HEADER]: unlockProof } });
    if (!result.success) throw failure(result.status);
    const d = result.data as any;
    if (!d || typeof d.walletId !== 'string' || !UUID.test(d.walletId) || !Number.isInteger(d.version) ||
        typeof d.serverShare !== 'string' || !/^[a-f0-9]{64}$/.test(d.serverShare)) throw new Error('wallet_vault_unavailable');
    return { walletId: d.walletId, version: d.version, serverShare: d.serverShare,
      envelope: d.envelope === null ? null : readHybridEnvelope(d.envelope) };
  },
  /** `proof` is a `wallet:unlock` proof when creating (expectedVersion 0), `wallet:sign` when replacing. */
  async save(walletId: string, envelope: HybridVaultEnvelope, expectedVersion: number, proof: string): Promise<void> {
    const result = await apiClient.post('/wallet/vault', { walletId, envelope: JSON.stringify(envelope), expectedVersion },
      { skipEventSegment: true, retries: 0, headers: { [STEP_UP_HEADER]: proof } });
    if (!result.success) throw failure(result.status);
  },
};
