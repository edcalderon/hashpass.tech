const mockIdentity = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
let mockEnvironment = 'development';
jest.mock('../../lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockIdentity(...args),
  isResolveIdentityError: (v: { status?: number }) => typeof v.status === 'number',
}));
jest.mock('../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: mockFrom, rpc: mockRpc }),
  getSupabaseServerEnv: () => ({ environment: mockEnvironment }),
}));
// The wallet package is ESM-only; the route only needs envelope shape validation here.
jest.mock('@hashpass/wallet', () => ({
  readHybridEnvelope: (value: string) => JSON.parse(value),
}));

import { createHmac } from 'node:crypto';
import { GET, POST } from '../../app/api/wallet/vault+api';
import { issueStepUpProof } from '../../lib/server/pin-auth';
import { STEP_UP_HEADER } from '../../lib/step-up-session';

const owner = '00000000-0000-4000-8000-000000000001';
const walletId = '00000000-0000-4000-8000-000000000003';
const hex = (n: number) => 'a'.repeat(n);
// Shaped to pass readHybridEnvelope; contents are opaque for these route tests.
const envelope = JSON.stringify({
  format: 'hashpass-hybrid-vault', version: 1, algorithm: 'AES-256-GCM',
  kdf: 'PBKDF2-SHA256+HKDF-SHA256', iterations: 210_000,
  salt: hex(64), wrapIv: hex(24), wrappedDek: hex(96), iv: hex(24), ciphertext: hex(80),
});
const proof = (scope: 'wallet:unlock' | 'wallet:sign' | 'wallet:recover', user = owner) => issueStepUpProof(user, scope).token;
const bearer = { Authorization: 'Bearer session' };

beforeEach(() => {
  jest.clearAllMocks();
  mockEnvironment = 'development';
  process.env.HASHPASS_PIN_PEPPER = 'p'.repeat(48);
  process.env.HASHPASS_WALLET_SETUP_ENABLED = 'true';
  process.env.HASHPASS_VAULT_KEK = 'k'.repeat(48);
  mockIdentity.mockResolvedValue({ registryUserId: owner });
  mockRpc.mockImplementation(async (name: string) =>
    name === 'get_user_wallet_vault'
      ? { data: { walletId, envelope, version: 1, keyVersion: 1 }, error: null }
      : { data: { walletId, version: 2, keyVersion: 1 }, error: null });
  const query = { select: () => query, eq: () => query, maybeSingle: () => Promise.resolve({ data: { id: walletId }, error: null }) };
  mockFrom.mockImplementation(() => query);
});
afterAll(() => {
  delete process.env.HASHPASS_PIN_PEPPER; delete process.env.HASHPASS_WALLET_SETUP_ENABLED; delete process.env.HASHPASS_VAULT_KEK;
});

describe('vault route proof scopes', () => {
  it('reads with an unlock proof and hands back the deterministic server share', async () => {
    const response = await GET(new Request('https://localhost/api/wallet/vault', { headers: { [STEP_UP_HEADER]: proof('wallet:unlock') } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.walletId).toBe(walletId);
    expect(body.serverShare).toBe(createHmac('sha256', 'k'.repeat(48))
      .update(`hashpass-vault-share|v1|${owner}|${walletId}`).digest('hex'));
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
  it('reads with a recovery proof so a reset flow can re-wrap the vault', async () => {
    const response = await GET(new Request('https://localhost/api/wallet/vault', { headers: { [STEP_UP_HEADER]: proof('wallet:recover') } }));
    expect(response.status).toBe(200);
  });
  it('rejects reads with no proof, a signing proof, or another user proof', async () => {
    for (const header of [undefined, proof('wallet:sign'), proof('wallet:unlock', '00000000-0000-4000-8000-000000000002')]) {
      const response = await GET(new Request('https://localhost/api/wallet/vault', header ? { headers: { [STEP_UP_HEADER]: header } } : undefined));
      expect(response.status).toBe(403);
    }
  });
  it('creates only with an unlock proof, never with a recovery proof', async () => {
    const request = (p: string) => new Request('https://localhost/api/wallet/vault', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer, [STEP_UP_HEADER]: p }, body: JSON.stringify({ walletId, envelope, expectedVersion: 0 }),
    });
    expect((await POST(request(proof('wallet:unlock')))).status).toBe(200);
    expect((await POST(request(proof('wallet:recover')))).status).toBe(403);
    expect((await POST(request(proof('wallet:sign')))).status).toBe(403);
  });
  it('replaces with a sign proof or a recovery proof, but not an unlock proof', async () => {
    const request = (p: string) => new Request('https://localhost/api/wallet/vault', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer, [STEP_UP_HEADER]: p }, body: JSON.stringify({ walletId, envelope, expectedVersion: 1 }),
    });
    expect((await POST(request(proof('wallet:sign')))).status).toBe(200);
    expect((await POST(request(proof('wallet:recover')))).status).toBe(200);
    expect((await POST(request(proof('wallet:unlock')))).status).toBe(403);
  });
  it('requires a bearer token for writes, ignoring ambient cookies', async () => {
    const response = await POST(new Request('https://localhost/api/wallet/vault', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'session=abc', [STEP_UP_HEADER]: proof('wallet:unlock') },
      body: JSON.stringify({ walletId, envelope, expectedVersion: 0 }),
    }));
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('maps a save conflict to 409 and stays development-only', async () => {
    mockEnvironment = 'production';
    expect((await GET(new Request('https://localhost/api/wallet/vault', { headers: { [STEP_UP_HEADER]: proof('wallet:unlock') } }))).status).toBe(503);
    mockEnvironment = 'development';
    mockRpc.mockResolvedValue({ data: null, error: { code: '23514' } });
    const response = await POST(new Request('https://localhost/api/wallet/vault', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer, [STEP_UP_HEADER]: proof('wallet:sign') },
      body: JSON.stringify({ walletId, envelope, expectedVersion: 1 }),
    }));
    expect(response.status).toBe(409);
  });
});
