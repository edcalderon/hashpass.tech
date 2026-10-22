const mockGet = jest.fn();
const mockPost = jest.fn();
const mockParse = jest.fn();
jest.mock('../../lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) } }));
// The package manifest suite covers the real address codecs.
jest.mock('@hashpass/wallet/manifest', () => ({ parsePublicWallet: (...args: unknown[]) => mockParse(...args) }));
import { createWalletEnrollmentClient, walletEnrollmentClient as client } from '../../lib/wallet/enrollment-client';
const walletId = '00000000-0000-4000-8000-000000000001';
const operationId = '00000000-0000-4000-8000-000000000002';
const row = { scope: { ownerId: '00000000-0000-4000-8000-000000000003', walletId, environment: 'development' }, state: 'enrolled', setupEnabled: true, wallet: null };
beforeEach(() => { jest.resetAllMocks(); mockParse.mockImplementation(value => value); });
it('loads canonical enrollment outside event routing with automatic retries disabled', async () => {
  mockGet.mockResolvedValue({ success: true, data: row });
  expect(await client.load()).toEqual(row);
  expect(mockGet).toHaveBeenCalledWith('/wallet/enrollment', { skipEventSegment: true, retries: 0 });
});
it.each([null, {}, { ...row, scope: { ...row.scope, ownerId: 'invalid' } }, { ...row, scope: { ...row.scope, walletId: 'invalid' } }, { ...row, scope: { ...row.scope, environment: 'unknown' } }, { ...row, state: 'invalid' }, { ...row, setupEnabled: 'true' }, { ...row, state: 'provisioning' }, { ...row, state: 'provisioning', operationId, network: 'invalid' }])('rejects malformed enrollment metadata %#', async data => {
  mockGet.mockResolvedValue({ success: true, data });
  await expect(client.load()).rejects.toThrow('wallet_metadata_unavailable');
});
it('fails closed when enrollment cannot be loaded', async () => {
  mockGet.mockResolvedValue({ success: false });
  await expect(client.load()).rejects.toThrow('wallet_metadata_unavailable');
});
it('reserves with the supplied durable operation ID', async () => {
  const reserved = { ...row, state: 'provisioning', operationId, network: 'testnet' };
  mockPost.mockResolvedValue({ success: true, data: reserved });
  expect(await client.reserve(walletId, operationId)).toEqual(reserved);
  expect(mockPost).toHaveBeenCalledWith('/wallet/enrollment', { action: 'reserve', walletId, operationId }, { skipEventSegment: true, retries: 0 });
});
it.each(['reserve', 'register'] as const)('distinguishes conflicts from transport failures during %s', async action => {
  mockPost.mockResolvedValueOnce({ success: false, status: 409 }).mockResolvedValueOnce({ success: false, status: 503 });
  const call = () => action === 'reserve' ? client.reserve(walletId, operationId) : client.register(walletId, operationId, {} as any);
  await expect(call()).rejects.toThrow('wallet_setup_conflict');
  await expect(call()).rejects.toThrow('wallet_metadata_unavailable');
});
it('validates both outbound and returned public manifests during registration', async () => {
  const publicWallet = { network: 'testnet' };
  const registered = { ...row, state: 'registered', network: 'testnet', operationId, wallet: publicWallet };
  mockPost.mockResolvedValue({ success: true, data: registered });
  expect(await client.register(walletId, operationId, publicWallet as any)).toEqual(registered);
  expect(mockParse).toHaveBeenCalledTimes(2);
  expect(mockPost.mock.calls[0][1]).toEqual({ action: 'register', walletId, operationId, wallet: publicWallet });
  mockParse.mockImplementation(() => { throw new Error('invalid_public_wallet'); });
  mockPost.mockClear();
  await expect(client.register(walletId, operationId, {} as any)).rejects.toThrow('invalid_public_wallet');
  expect(mockPost).not.toHaveBeenCalled();
});

describe('step-up proof', () => {
  const reserved = { ...row, state: 'provisioning', operationId, network: 'testnet' };
  it('is sent as a header on reserve only, and read fresh for each call', async () => {
    let proof: string | null = 'proof.one';
    const stepUp = createWalletEnrollmentClient(() => proof);
    mockPost.mockResolvedValue({ success: true, data: reserved });
    mockGet.mockResolvedValue({ success: true, data: row });
    await stepUp.load();
    await stepUp.reserve(walletId, operationId);
    proof = 'proof.two';
    await stepUp.reserve(walletId, operationId);
    expect(mockGet).toHaveBeenCalledWith('/wallet/enrollment', { skipEventSegment: true, retries: 0 });
    expect(mockPost.mock.calls[0][2]).toEqual({ skipEventSegment: true, retries: 0, headers: { 'X-Hashpass-Step-Up': 'proof.one' } });
    expect(mockPost.mock.calls[1][2].headers['X-Hashpass-Step-Up']).toBe('proof.two');
    mockPost.mockClear();
    mockParse.mockImplementation(value => value);
    mockPost.mockResolvedValue({ success: true, data: { ...reserved, state: 'registered', wallet: { network: 'testnet' } } });
    await stepUp.register(walletId, operationId, { network: 'testnet' } as any);
    expect(mockPost.mock.calls[0][2]).toEqual({ skipEventSegment: true, retries: 0 });
  });

  it('maps a refusal to a distinct error the screen can answer with the PIN pad', async () => {
    const stepUp = createWalletEnrollmentClient(() => null);
    mockPost.mockResolvedValue({ success: false, status: 403 });
    await expect(stepUp.reserve(walletId, operationId)).rejects.toThrow('wallet_step_up_required');
    expect(mockPost.mock.calls[0][2]).toEqual({ skipEventSegment: true, retries: 0 });
  });
});
