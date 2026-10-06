/// <reference types="jest" />

const WALLET = '11111111111111111111111111111111';
const mockGetSupabaseServerForRequest = jest.fn();
const mockRpc = jest.fn();
const mockSingle = jest.fn();
const mockGetUser = jest.fn();
const mockUpdate = jest.fn();
const mockSyncPublicUserRegistry = jest.fn();
const mockVerify = jest.fn();

jest.mock('../../../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: (request: Request) => mockGetSupabaseServerForRequest(request),
}));
jest.mock('../../../../lib/auth/public-user-registry', () => ({
  syncPublicUserRegistry: (...args: unknown[]) => mockSyncPublicUserRegistry(...args),
}));
jest.mock('@solana/web3.js', () => ({
  PublicKey: class {
    toBytes() { return new Uint8Array(32); }
  },
}));
jest.mock('bs58', () => ({ decode: () => new Uint8Array(64) }));
jest.mock('@noble/ed25519', () => ({ verify: mockVerify }));

const requestFor = (body: unknown, token = 'session-token') => new Request(
  'https://api.hashpass.tech/api/auth/wallet/solana',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  },
);

const configureSupabase = (walletUserId: string | null) => {
  mockGetSupabaseServerForRequest.mockReturnValue({
    rpc: mockRpc,
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ single: mockSingle }) }) }),
      update: () => ({ eq: () => ({ eq: mockUpdate }) }),
    }),
  });
  mockRpc.mockResolvedValue({ data: [{ allowed: true }], error: null });
  mockSingle.mockResolvedValue({
    data: {
      nonce: 'nonce-123',
      nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
      user_id: walletUserId,
    },
    error: null,
  });
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
  mockUpdate.mockResolvedValue({ error: null });
};

describe('Solana wallet API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetSupabaseServerForRequest.mockReset();
    mockRpc.mockReset();
    mockSingle.mockReset();
    mockGetUser.mockReset();
    mockUpdate.mockReset();
    mockSyncPublicUserRegistry.mockReset();
    mockVerify.mockReset();
    mockVerify.mockResolvedValue(true);
    mockSyncPublicUserRegistry.mockResolvedValue(undefined);
    configureSupabase('user-123');
  });

  it('handles preflight and required-field validation', async () => {
    const { OPTIONS, POST } = require('../../../../app/api/auth/wallet/solana+api');
    expect(OPTIONS().status).toBe(204);
    expect((await POST(requestFor({}))).status).toBe(400);
    expect((await POST(requestFor({ message: 'm', signature: 's', walletAddress: 'invalid' }))).status).toBe(400);
  });

  it('returns CORS-safe errors for rate limiting and unexpected failures', async () => {
    const { POST } = require('../../../../app/api/auth/wallet/solana+api');
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    expect((await POST(requestFor({ message: 'nonce: nonce-123', signature: 'signature', walletAddress: WALLET }))).status).toBe(500);

    configureSupabase(null);
    mockGetSupabaseServerForRequest.mockImplementation(() => { throw new Error('offline'); });
    expect((await POST(requestFor({}))).status).toBe(500);
  });

  it('refuses to reassign a wallet linked to another user', async () => {
    configureSupabase('different-user');
    const { POST } = require('../../../../app/api/auth/wallet/solana+api');
    const response = await POST(requestFor({ message: 'nonce: nonce-123', signature: 'signature', walletAddress: WALLET }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'This wallet is already linked to another user.' });
    expect(mockSyncPublicUserRegistry).not.toHaveBeenCalled();
  });
});
