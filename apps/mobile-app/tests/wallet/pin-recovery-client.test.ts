import { walletPinRecoveryClient } from '../../lib/wallet/pin-recovery-client';
import { apiClient } from '../../lib/api-client';

jest.mock('../../lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
}));
const mockPost = jest.fn();

const proof = { token: 'recovery-proof', scope: 'wallet:recover' as const, expiresAt: '2026-10-24T12:00:00Z' };

beforeEach(() => mockPost.mockReset());

it('sends a recovery code to the signed-in account, without a proof header', async () => {
  mockPost.mockResolvedValue({ success: true, data: {} });
  await walletPinRecoveryClient.sendRecoveryCode();
  expect(mockPost).toHaveBeenCalledWith('/wallet/pin-recovery', { action: 'send' },
    { skipEventSegment: true, retries: 0 });
});

it('maps rate limiting and a wrong code to their own errors', async () => {
  mockPost.mockResolvedValueOnce({ success: false, data: null, status: 429 });
  await expect(walletPinRecoveryClient.sendRecoveryCode()).rejects.toThrow('wallet_recovery_rate_limited');
  mockPost.mockResolvedValueOnce({ success: false, data: null, status: 403 });
  await expect(walletPinRecoveryClient.verifyRecoveryCode('000000')).rejects.toThrow('wallet_recovery_invalid');
  mockPost.mockResolvedValueOnce({ success: false, data: null, status: 503 });
  await expect(walletPinRecoveryClient.sendRecoveryCode()).rejects.toThrow('wallet_recovery_unavailable');
});

it('returns only a wallet:recover proof from a verified code', async () => {
  mockPost.mockResolvedValue({ success: true, data: { proof } });
  await expect(walletPinRecoveryClient.verifyRecoveryCode('123456')).resolves.toEqual(proof);
  expect(mockPost).toHaveBeenCalledWith('/wallet/pin-recovery', { action: 'verify', code: '123456' },
    { skipEventSegment: true, retries: 0 });
});

it('refuses a proof that is not a wallet:recover proof, whatever the server said', async () => {
  for (const bad of [undefined, { token: 't', scope: 'wallet:sign', expiresAt: 'x' }, { token: 't', scope: 'wallet:recover' }]) {
    mockPost.mockResolvedValueOnce({ success: true, data: { proof: bad } });
    await expect(walletPinRecoveryClient.verifyRecoveryCode('123456')).rejects.toThrow('wallet_recovery_unavailable');
  }
});

it('sets the recovered PIN with the recovery proof in the step-up header', async () => {
  mockPost.mockResolvedValue({ success: true, data: {} });
  await walletPinRecoveryClient.setRecoveredPin('4321', proof);
  expect(mockPost).toHaveBeenCalledWith('/wallet/pin-recovery', { action: 'set-pin', newPin: '4321' },
    { skipEventSegment: true, retries: 0, headers: { 'X-Hashpass-Step-Up': 'recovery-proof' } });
});

it('maps a set-pin failure to unavailable rather than a code error', async () => {
  mockPost.mockResolvedValueOnce({ success: false, data: null, status: 403 });
  await expect(walletPinRecoveryClient.setRecoveredPin('4321', proof)).rejects.toThrow('wallet_recovery_invalid');
});
