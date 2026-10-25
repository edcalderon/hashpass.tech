const mockIdentity = jest.fn();
const mockRpc = jest.fn();
const mockLookup = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();
const mockParse = jest.fn();
let mockEnvironment = "development";
jest.mock('../../lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockIdentity(...args),
  isResolveIdentityError: (v: { status?: number }) => typeof v.status === 'number',
}));
jest.mock('../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: mockFrom, rpc: mockRpc }),
  getSupabaseServerEnv: () => ({ environment: mockEnvironment }),
}));
// Address validation is exercised with real crypto/codecs in the package tests.
jest.mock('@hashpass/wallet/manifest', () => ({ parsePublicWallet: (...args: unknown[]) => mockParse(...args) }));
import { GET, POST } from '../../app/api/wallet/enrollment+api';
import { issueStepUpProof } from '../../lib/server/pin-auth';
import { STEP_UP_HEADER } from '../../lib/step-up-session';
const PEPPER = 'test-pepper-test-pepper-test-pepper-0123456789';
const owner = '00000000-0000-4000-8000-000000000001';
const operation = '00000000-0000-4000-8000-000000000002';
const row = { id: '00000000-0000-4000-8000-000000000003', user_id: owner, state: 'enrolled', operation_id: null, network: null };
const walletProof = () => issueStepUpProof(owner, 'wallet:sign').token;
const request = (body: unknown, proof: string | null = walletProof()) => new Request('https://localhost/api/wallet/enrollment', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-session', ...(proof ? { [STEP_UP_HEADER]: proof } : {}) }, body: JSON.stringify({ walletId: row.id, ...(body as object) }) });
beforeEach(() => {
  jest.clearAllMocks(); mockEnvironment = 'development';
  mockParse.mockImplementation(() => { throw new Error('invalid_public_wallet'); });
  process.env.HASHPASS_WALLET_SETUP_ENABLED = 'true';
  process.env.HASHPASS_PIN_PEPPER = PEPPER;
  mockIdentity.mockResolvedValue({ registryUserId: owner });
  mockLookup.mockResolvedValue({ data: row, error: null });
  const query = { select: () => query, eq: (...args: unknown[]) => { mockEq(...args); return query; }, maybeSingle: mockLookup };
  mockFrom.mockReturnValue(query);
});
afterAll(() => { delete process.env.HASHPASS_WALLET_SETUP_ENABLED; delete process.env.HASHPASS_PIN_PEPPER; });
it('denies unauthenticated requests before reading the body or database', async () => {
  mockIdentity.mockResolvedValue({ error: 'unauthorized', status: 401 });
  expect((await GET(new Request('https://localhost/api/wallet/enrollment'))).status).toBe(401);
  expect((await POST(request({ action: 'reserve', operationId: operation }))).status).toBe(401);
  expect(mockFrom).not.toHaveBeenCalled(); expect(mockRpc).not.toHaveBeenCalled();
});
it('returns canonical scope with no-store caching', async () => {
  const response = await GET(new Request('https://localhost/api/wallet/enrollment?userId=attacker'));
  expect(response.status).toBe(200);
  expect((await response.json()).scope.ownerId).toBe(owner);
  expect(mockEq).toHaveBeenCalledWith('user_id', owner);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
});
it('takes reservation ownership exclusively from the authenticated canonical identity', async () => {
  mockRpc.mockResolvedValue({ data: { ...row, state: 'provisioning', operation_id: operation, network: 'testnet' }, error: null });
  expect((await POST(request({ action: 'reserve', operationId: operation }))).status).toBe(200);
  expect(mockRpc).toHaveBeenCalledWith('reserve_user_wallet', { p_user_id: owner, p_operation_id: operation, p_network: 'testnet' });
  expect((await POST(request({ action: 'reserve', operationId: operation, userId: 'attacker' }))).status).toBe(400);
});
it('rejects secrets and invalid public manifests', async () => {
  expect((await POST(request({ action: 'reserve', operationId: operation, mnemonic: 'never upload' }))).status).toBe(400);
  expect((await POST(request({ action: 'register', operationId: operation, wallet: { seed: 'never upload' } }))).status).toBe(400);
  expect(mockRpc).not.toHaveBeenCalled();
});
it('fails closed on missing enrollment, unavailable DB and disabled rollout', async () => {
  // A missing user_wallet row for a resolved registry user is provisioning drift, not an
  // outage: it is a distinct 409 so the UI can ask for provisioning instead of a retry.
  mockLookup.mockResolvedValue({ data: null, error: null });
  expect((await GET(new Request('https://localhost/api/wallet/enrollment'))).status).toBe(409);
  mockLookup.mockResolvedValue({ data: null, error: { message: 'db down' } });
  expect((await GET(new Request('https://localhost/api/wallet/enrollment'))).status).toBe(503);
  mockLookup.mockResolvedValue({ data: row, error: null });
  mockRpc.mockResolvedValue({ data: null, error: { code: '23514' } });
  expect((await POST(request({ action: 'reserve', operationId: operation }))).status).toBe(409);
  delete process.env.HASHPASS_WALLET_SETUP_ENABLED;
  expect((await POST(request({ action: 'reserve', operationId: operation }))).status).toBe(503);
});

it('removes ambient cookies before verifying mutation identity', async () => {
  const req = request({ action: 'reserve', operationId: operation });
  req.headers.set('Cookie', 'test-cookie=ambient');
  mockIdentity.mockResolvedValueOnce({ error: 'unauthorized', status: 401 });
  expect((await POST(req)).status).toBe(401);
  expect(mockIdentity.mock.calls[0][0].headers.get('Cookie')).toBeNull();
});
it('rejects oversized input and cookie-only mutations', async () => {
  expect((await POST(request({ action: 'reserve', operationId: operation, extra: 'x'.repeat(5000) }))).status).toBe(400);
  const req = request({ action: 'reserve', operationId: operation });
  req.headers.delete('Authorization');
  expect((await POST(req)).status).toBe(401);
  expect(mockRpc).not.toHaveBeenCalled();
});

it('rejects an account switch between the UI and mutation request', async () => {
  expect((await POST(request({ action: 'reserve', operationId: operation, walletId: operation }))).status).toBe(409);
  expect(mockRpc).not.toHaveBeenCalled();
});

it('registers only validated public addresses under the authenticated owner', async () => {
  const wallet = { version: 1, accountIndex: 0, network: 'testnet',
    ethereum: { path: "m/44'/60'/0'/0/0", address: 'public-eth' },
    bitcoin: { path: "m/84'/1'/0'/0/0", address: 'public-btc' },
    solana: { path: "m/44'/501'/0'/0'", address: 'public-sol' } };
  mockParse.mockReturnValue(wallet);
  mockRpc.mockResolvedValue({ data: { ...row, state: 'registered', network: 'testnet', operation_id: operation,
    ethereum_address: 'public-eth', bitcoin_address: 'public-btc', solana_address: 'public-sol' }, error: null });
  const response = await POST(request({ action: 'register', operationId: operation, wallet }));
  expect(response.status).toBe(200);
  expect(mockRpc).toHaveBeenCalledWith('register_user_wallet', { p_user_id: owner, p_operation_id: operation,
    p_network: 'testnet', p_ethereum_address: 'public-eth', p_bitcoin_address: 'public-btc', p_solana_address: 'public-sol' });
  expect((await response.json()).wallet).toEqual(wallet);
});
it('keeps production disabled even with the development rollout flag set', async () => {
  mockEnvironment = 'production';
  const response = await GET(new Request('https://localhost/api/wallet/enrollment'));
  expect((await response.json()).setupEnabled).toBe(false);
  expect((await POST(request({ action: 'reserve', operationId: operation }))).status).toBe(503);
  expect(mockRpc).not.toHaveBeenCalled();
});

describe('second factor on wallet creation', () => {
  const reserve = { action: 'reserve', operationId: operation };
  const reserved = { ...row, state: 'provisioning', operation_id: operation, network: 'testnet' };
  const denied = async (response: Response) => {
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('step_up_required');
    expect(mockRpc).not.toHaveBeenCalled();
  };

  it('creates the reservation once a fresh wallet:sign proof for this person is presented', async () => {
    mockRpc.mockResolvedValue({ data: reserved, error: null });
    expect((await POST(request(reserve))).status).toBe(200);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('refuses a reservation with no proof, a malformed one or a forged one', async () => {
    await denied(await POST(request(reserve, null)));
    await denied(await POST(request(reserve, 'not-a-proof')));
    const [body, signature] = walletProof().split('.');
    await denied(await POST(request(reserve, `${body}.${signature!.split('').reverse().join('')}`)));
    await denied(await POST(request(reserve, 'x'.repeat(600))));
  });

  it('refuses a proof minted for another scope, another person or an earlier time', async () => {
    await denied(await POST(request(reserve, issueStepUpProof(owner, 'app:unlock').token)));
    await denied(await POST(request(reserve, issueStepUpProof('00000000-0000-4000-8000-0000000000ff', 'wallet:sign').token)));
    await denied(await POST(request(reserve, issueStepUpProof(owner, 'wallet:sign', Date.now() - 120_000).token)));
  });

  it('refuses a proof signed under a different pepper', async () => {
    const foreign = issueStepUpProof(owner, 'wallet:sign', Date.now(), { ...process.env, HASHPASS_PIN_PEPPER: 'another-pepper-another-pepper-another-pepper' }).token;
    await denied(await POST(request(reserve, foreign)));
  });

  it('fails closed, not open, when the pepper is not configured', async () => {
    const proof = walletProof();
    delete process.env.HASHPASS_PIN_PEPPER;
    const response = await POST(request(reserve, proof));
    expect(response.status).toBe(503);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('keeps registration a public-metadata call that needs no proof of its own', async () => {
    mockParse.mockReturnValue({ network: 'testnet', ethereum: { address: 'e' }, bitcoin: { address: 'b' }, solana: { address: 's' } });
    mockRpc.mockResolvedValue({ data: { ...reserved, state: 'registered', ethereum_address: 'e', bitcoin_address: 'b', solana_address: 's' }, error: null });
    expect((await POST(request({ action: 'register', operationId: operation, wallet: {} }, null))).status).toBe(200);
  });

  it('checks the proof after the cheaper request validation, never before authentication', async () => {
    mockIdentity.mockResolvedValue({ error: 'unauthorized', status: 401 });
    expect((await POST(request(reserve, null))).status).toBe(401);
  });
});
