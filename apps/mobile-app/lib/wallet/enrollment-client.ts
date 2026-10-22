import { parsePublicWallet } from '@hashpass/wallet/manifest';
import type { EnrollmentTransport, WalletEnrollment } from '@hashpass/wallet';
import { apiClient } from '../api-client';
import { STEP_UP_HEADER } from '../step-up-session';

function enrollment(value: unknown): WalletEnrollment {
  const row = value as WalletEnrollment;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!row?.scope || typeof row.scope.ownerId !== 'string' || !uuid.test(row.scope.ownerId) ||
      typeof row.scope.walletId !== 'string' || !uuid.test(row.scope.walletId) ||
      !['development', 'production'].includes(row.scope.environment) ||
      !['enrolled', 'provisioning', 'registered'].includes(row.state) || typeof row.setupEnabled !== 'boolean' ||
      (row.state !== 'enrolled' && (!row.operationId || !uuid.test(row.operationId) || !['testnet', 'mainnet'].includes(row.network ?? '')))) {
    throw new Error('wallet_metadata_unavailable');
  }
  return { ...row, wallet: row.state === 'registered' ? parsePublicWallet(row.wallet) : null };
}

const failure = (status?: number) => new Error(
  status === 409 ? 'wallet_setup_conflict' : status === 403 ? 'wallet_step_up_required' : 'wallet_metadata_unavailable');

/**
 * `stepUpProof` supplies the short-lived `wallet:sign` proof from the PIN pad. Only the
 * reservation (the moment a wallet is created) carries it; reading metadata does not.
 */
export const createWalletEnrollmentClient = (stepUpProof: () => string | null = () => null): EnrollmentTransport => ({
  async load() {
    const result = await apiClient.get('/wallet/enrollment', { skipEventSegment: true, retries: 0 });
    if (!result.success) throw new Error('wallet_metadata_unavailable');
    return enrollment(result.data);
  },
  async reserve(walletId, operationId) {
    const proof = stepUpProof();
    const result = await apiClient.post('/wallet/enrollment', { action: 'reserve', walletId, operationId },
      { skipEventSegment: true, retries: 0, ...(proof ? { headers: { [STEP_UP_HEADER]: proof } } : {}) });
    if (!result.success) throw failure(result.status);
    return enrollment(result.data);
  },
  async register(walletId, operationId, wallet) {
    const result = await apiClient.post('/wallet/enrollment', { action: 'register', walletId, operationId, wallet: parsePublicWallet(wallet) }, { skipEventSegment: true, retries: 0 });
    if (!result.success) throw failure(result.status);
    return enrollment(result.data);
  },
});

export const walletEnrollmentClient: EnrollmentTransport = createWalletEnrollmentClient();
