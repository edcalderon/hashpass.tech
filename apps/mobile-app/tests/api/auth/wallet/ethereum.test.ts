/// <reference types="jest" />

const WALLET = `0x${'1'.repeat(40)}`;
const mockGetSupabaseServerForRequest = jest.fn();
const mockRpc = jest.fn();
const mockSingle = jest.fn();
const mockGetUser = jest.fn();
const mockUpdate = jest.fn();
const mockSyncPublicUserRegistry = jest.fn();
const mockSiweMessage = jest.fn();
const mockVerify = jest.fn();
const mockVerifyMessage = jest.fn();
const mockCreateUser = jest.fn();
const mockGenerateLink = jest.fn();

jest.mock('../../../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: (request: Request) => mockGetSupabaseServerForRequest(request),
}));
jest.mock('../../../../lib/auth/public-user-registry', () => ({
  syncPublicUserRegistry: (...args: unknown[]) => mockSyncPublicUserRegistry(...args),
}));
jest.mock('siwe', () => ({ SiweMessage: mockSiweMessage }));
jest.mock('ethers', () => ({
  ethers: {
    getAddress: (address: string) => address,
    verifyMessage: (...args: unknown[]) => mockVerifyMessage(...args),
  },
}));

const requestFor = (body: unknown, token = 'session-token') => new Request(
  'https://api.hashpass.tech/api/auth/wallet/ethereum',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  },
);

const configureSupabase = (walletUserId: string | null) => {
  mockGetSupabaseServerForRequest.mockReturnValue({
    rpc: mockRpc,
    auth: { getUser: mockGetUser, admin: { createUser: mockCreateUser, generateLink: mockGenerateLink } },
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

describe('Ethereum wallet API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetSupabaseServerForRequest.mockReset();
    mockRpc.mockReset();
    mockSingle.mockReset();
    mockGetUser.mockReset();
    mockUpdate.mockReset();
    mockSyncPublicUserRegistry.mockReset();
    mockSiweMessage.mockReset();
    mockVerify.mockReset();
    mockVerifyMessage.mockReset();
    mockCreateUser.mockReset();
    mockGenerateLink.mockReset();
    mockSiweMessage.mockImplementation(() => ({
      domain: 'api.hashpass.tech', address: WALLET, nonce: 'nonce-123', verify: mockVerify,
    }));
    mockVerify.mockResolvedValue({ success: true });
    mockVerifyMessage.mockReturnValue(WALLET);
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'created-user' } }, error: null });
    mockGenerateLink.mockResolvedValue({ data: { properties: { action_link: 'https://auth.example/link?token_hash=token' } }, error: null });
    mockSyncPublicUserRegistry.mockResolvedValue(undefined);
    configureSupabase('user-123');
  });

  it('handles preflight and required-field validation', async () => {
    const { OPTIONS, POST } = require('../../../../app/api/auth/wallet/ethereum+api');
    expect(OPTIONS().status).toBe(204);
    expect((await POST(requestFor({}))).status).toBe(400);
    expect((await POST(requestFor({ message: 'm', signature: 's', walletAddress: 'invalid' }))).status).toBe(400);
  });

  it('handles rate-limit and signature verification failures with CORS headers', async () => {
    const { POST } = require('../../../../app/api/auth/wallet/ethereum+api');
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    expect((await POST(requestFor({ message: 'm', signature: 's', walletAddress: WALLET }))).status).toBe(500);

    mockVerify.mockResolvedValueOnce({ success: false, error: 'bad signature' });
    expect((await POST(requestFor({ message: 'm', signature: 's', walletAddress: WALLET }))).status).toBe(401);

    mockVerify.mockRejectedValueOnce(new Error('strict verifier unavailable'));
    mockVerifyMessage.mockReturnValueOnce(`0x${'2'.repeat(40)}`);
    expect((await POST(requestFor({ message: 'm', signature: 's', walletAddress: WALLET }))).status).toBe(401);

    mockVerify.mockRejectedValueOnce(new Error('strict verifier unavailable'));
    mockVerifyMessage.mockImplementationOnce(() => { throw new Error('fallback unavailable'); });
    expect((await POST(requestFor({ message: 'm', signature: 's', walletAddress: WALLET }))).status).toBe(401);
  });

  it('reports account creation and unexpected service failures', async () => {
    configureSupabase(null);
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockCreateUser.mockResolvedValue({ data: { user: null }, error: { message: 'create failed' } });
    const { POST } = require('../../../../app/api/auth/wallet/ethereum+api');
    expect((await POST(requestFor({ message: 'm', signature: 's', walletAddress: WALLET }, ''))).status).toBe(500);

    mockGetSupabaseServerForRequest.mockImplementation(() => { throw new Error('offline'); });
    expect((await POST(requestFor({}))).status).toBe(500);
  });

  it('links a verified wallet to the existing HashPass user without minting another session', async () => {
    const { POST } = require('../../../../app/api/auth/wallet/ethereum+api');
    const response = await POST(requestFor({ message: 'SIWE message', signature: 'signature', walletAddress: WALLET }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      userId: 'user-123',
      linkedToExistingUser: true,
      walletAddress: WALLET,
    });
    expect(mockSyncPublicUserRegistry).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('refuses to reassign a wallet linked to another user', async () => {
    configureSupabase('different-user');
    const { POST } = require('../../../../app/api/auth/wallet/ethereum+api');
    const response = await POST(requestFor({ message: 'SIWE message', signature: 'signature', walletAddress: WALLET }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'This wallet is already linked to another user.' });
    expect(mockSyncPublicUserRegistry).not.toHaveBeenCalled();
  });
});
