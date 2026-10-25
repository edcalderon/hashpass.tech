import { apiClient } from '../api-client';
import { STEP_UP_HEADER } from '../step-up-session';
import type { StepUpProof } from '../../types/step-up.types';

/** Transport for the wallet PIN recovery flow: emailed code, then a new PIN.
 * The PIN and the code exist only in the caller's closure; only the proof comes back. */
export const walletPinRecoveryClient = {
  async sendRecoveryCode(): Promise<void> {
    const result = await apiClient.post('/wallet/pin-recovery', { action: 'send' }, { skipEventSegment: true, retries: 0 });
    if (!result.success) throw recoveryFailure(result.status);
  },
  async verifyRecoveryCode(code: string): Promise<StepUpProof> {
    const result = await apiClient.post('/wallet/pin-recovery', { action: 'verify', code },
      { skipEventSegment: true, retries: 0 });
    if (!result.success) throw recoveryFailure(result.status);
    const proof = (result.data as { proof?: StepUpProof })?.proof;
    if (!proof?.token || proof.scope !== 'wallet:recover' || !proof.expiresAt) throw new Error('wallet_recovery_unavailable');
    return proof;
  },
  /** `proof` comes from verifyRecoveryCode and lives ten minutes: the vault is re-wrapped
   * under it first, and this runs second, so a failure between the two is retry-safe. */
  async setRecoveredPin(newPin: string, proof: StepUpProof): Promise<void> {
    const result = await apiClient.post('/wallet/pin-recovery', { action: 'set-pin', newPin },
      { skipEventSegment: true, retries: 0, headers: { [STEP_UP_HEADER]: proof.token } });
    if (!result.success) throw recoveryFailure(result.status);
  },
};

const recoveryFailure = (status?: number) => new Error(
  status === 429 ? 'wallet_recovery_rate_limited'
    : status === 403 ? 'wallet_recovery_invalid'
      : status === 503 ? 'wallet_recovery_unavailable'
        : 'wallet_recovery_unavailable');
