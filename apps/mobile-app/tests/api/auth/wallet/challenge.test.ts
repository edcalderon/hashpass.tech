/// <reference types="jest" />

const mockGetSupabaseServerForRequest = jest.fn();
const mockRpc = jest.fn();
const mockUpsert = jest.fn();

jest.mock('../../../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: (request: Request) => mockGetSupabaseServerForRequest(request),
}));

const requestFor = (body: unknown) => new Request('https://api.hashpass.tech/api/auth/wallet/challenge', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const configureSupabase = () => {
  mockGetSupabaseServerForRequest.mockReturnValue({
    rpc: mockRpc,
    from: () => ({ upsert: mockUpsert }),
  });
};

describe('wallet challenge API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetSupabaseServerForRequest.mockReset();
    mockRpc.mockReset();
    mockUpsert.mockReset();
    mockRpc.mockResolvedValue({ data: [{ allowed: true }], error: null });
    mockUpsert.mockResolvedValue({ error: null });
    configureSupabase();
  });

  it('handles preflight and request validation before contacting the database', async () => {
    const { OPTIONS, POST } = require('../../../../app/api/auth/wallet/challenge+api');
    expect(OPTIONS().status).toBe(204);
    expect((await POST(requestFor({}))).status).toBe(400);
    expect((await POST(requestFor({ walletAddress: 'bad', walletType: 'bitcoin' }))).status).toBe(400);
    expect((await POST(requestFor({ walletAddress: 'bad', walletType: 'ethereum' }))).status).toBe(400);
    expect((await POST(requestFor({ walletAddress: 'bad', walletType: 'solana' }))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns rate-limit failures and blocked responses', async () => {
    const { POST } = require('../../../../app/api/auth/wallet/challenge+api');
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } });
    expect((await POST(requestFor({ walletAddress: `0x${'a'.repeat(40)}`, walletType: 'ethereum' }))).status).toBe(500);
    mockRpc.mockResolvedValueOnce({ data: [{ allowed: false, blocked_until: 'tomorrow' }], error: null });
    expect((await POST(requestFor({ walletAddress: `0x${'a'.repeat(40)}`, walletType: 'ethereum' }))).status).toBe(429);
  });

  it('stores Ethereum and Solana challenges with the expected messages', async () => {
    const { POST } = require('../../../../app/api/auth/wallet/challenge+api');
    const ethereum = await POST(requestFor({ walletAddress: `0x${'A'.repeat(40)}`, walletType: 'ethereum', ipAddress: '198.51.100.2' }));
    expect(ethereum.status).toBe(200);
    await expect(ethereum.json()).resolves.toEqual(expect.objectContaining({ message: expect.stringContaining('Ethereum') }));
    expect(mockRpc).toHaveBeenCalledWith('check_wallet_auth_rate_limit', expect.objectContaining({ p_ip_address: '198.51.100.2' }));
    expect(mockUpsert).toHaveBeenCalled();

    const solana = await POST(requestFor({ walletAddress: '11111111111111111111111111111111', walletType: 'solana' }));
    expect(solana.status).toBe(200);
    await expect(solana.json()).resolves.toEqual(expect.objectContaining({ message: expect.stringContaining('Solana') }));
  });

  it('returns an internal error when the challenge service throws', async () => {
    mockGetSupabaseServerForRequest.mockImplementation(() => { throw new Error('offline'); });
    const { POST } = require('../../../../app/api/auth/wallet/challenge+api');
    expect((await POST(requestFor({ walletAddress: `0x${'a'.repeat(40)}`, walletType: 'ethereum' }))).status).toBe(500);
  });

  it('reports nonce persistence failures', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'write failed' } });
    const { POST } = require('../../../../app/api/auth/wallet/challenge+api');
    const response = await POST(requestFor({ walletAddress: `0x${'a'.repeat(40)}`, walletType: 'ethereum' }));
    expect(response.status).toBe(500);
  });
});
