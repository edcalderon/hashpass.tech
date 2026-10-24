import { hybridVaultClient } from '../../lib/wallet/hybrid-vault-api';
import { apiClient } from '../../lib/api-client';
import { readHybridEnvelope } from '@hashpass/wallet';

jest.mock('../../lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) },
}));
jest.mock('@hashpass/wallet', () => ({
  readHybridEnvelope: (...args: unknown[]) => mockReadEnvelope(...args),
}));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockReadEnvelope = jest.fn();

const walletId = '12345678-1234-1234-1234-123456789abc';
const serverShare = 'a'.repeat(64);
const envelope = { v: 1, ciphertext: 'wrapped', nonce: 'n' };

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockReadEnvelope.mockReset().mockImplementation((value: unknown) => value);
});

it('loads the vault with an unlock proof in the step-up header, validating the row shape', async () => {
  mockGet.mockResolvedValue({ success: true, data: { walletId, version: 2, serverShare, envelope } });
  const vault = await hybridVaultClient.load('unlock-proof');
  expect(mockGet).toHaveBeenCalledWith('/wallet/vault', {
    skipEventSegment: true, retries: 0, headers: { 'X-Hashpass-Step-Up': 'unlock-proof' },
  });
  expect(mockReadEnvelope).toHaveBeenCalledWith(envelope);
  expect(vault).toEqual({ walletId, version: 2, serverShare, envelope });
});

it('accepts a vault with no envelope yet (creation in progress)', async () => {
  mockGet.mockResolvedValue({ success: true, data: { walletId, version: 0, serverShare, envelope: null } });
  const vault = await hybridVaultClient.load('unlock-proof');
  expect(vault.envelope).toBe(null);
});

it('rejects malformed vault rows instead of trusting the server', async () => {
  for (const data of [null, { walletId: 'not-a-uuid', version: 1, serverShare },
    { walletId, version: 1.5, serverShare }, { walletId, version: 1, serverShare: 'zz' }]) {
    mockGet.mockResolvedValueOnce({ success: true, data });
    await expect(hybridVaultClient.load('unlock-proof')).rejects.toThrow('wallet_vault_unavailable');
  }
  expect(mockReadEnvelope).not.toHaveBeenCalled();
});

it('maps the failure statuses: a missing proof is step-up, a version race is a conflict', async () => {
  mockGet.mockResolvedValueOnce({ success: false, data: null, status: 403 });
  await expect(hybridVaultClient.load('unlock-proof')).rejects.toThrow('wallet_step_up_required');
  mockGet.mockResolvedValueOnce({ success: false, data: null, status: 409 });
  await expect(hybridVaultClient.load('unlock-proof')).rejects.toThrow('wallet_vault_conflict');
  mockGet.mockResolvedValueOnce({ success: false, data: null, status: 500 });
  await expect(hybridVaultClient.load('unlock-proof')).rejects.toThrow('wallet_vault_unavailable');
});

it('saves an envelope with the proof header and the expected version for optimistic concurrency', async () => {
  mockPost.mockResolvedValue({ success: true, data: {} });
  await hybridVaultClient.save(walletId, envelope as never, 3, 'sign-proof');
  expect(mockPost).toHaveBeenCalledWith('/wallet/vault',
    { walletId, envelope: JSON.stringify(envelope), expectedVersion: 3 },
    { skipEventSegment: true, retries: 0, headers: { 'X-Hashpass-Step-Up': 'sign-proof' } });
});

it('maps save failures the same way as loads', async () => {
  mockPost.mockResolvedValueOnce({ success: false, data: null, status: 403 });
  await expect(hybridVaultClient.save(walletId, envelope as never, 3, 'stale-proof')).rejects.toThrow('wallet_step_up_required');
  mockPost.mockResolvedValueOnce({ success: false, data: null, status: 409 });
  await expect(hybridVaultClient.save(walletId, envelope as never, 3, 'proof')).rejects.toThrow('wallet_vault_conflict');
});
