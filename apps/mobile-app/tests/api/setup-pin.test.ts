const mockIdentity = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockIdentity(...args),
  isResolveIdentityError: (identity: { status?: number }) => typeof identity.status === 'number',
}));
jest.mock('../../lib/supabase-server', () => ({ getSupabaseServerForRequest: () => ({ rpc: mockRpc }) }));

import { GET, POST } from '../../app/api/setup+api';
import { POST as PIN } from '../../app/api/setup/pin+api';
import { validSetupPatch } from '../../lib/server/setup-api';
import { verifyStepUpProof } from '../../lib/server/pin-auth';

const id = '00000000-0000-4000-8000-000000000001';
const url = 'https://api.hashpass.tech/api/setup';
const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer token' };
const call = (handler: (request: Request) => Promise<Response>, body: unknown, extra: Record<string, string> = headers, path = url) =>
  handler(new Request(path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: extra }));
const rpcNames = () => mockRpc.mock.calls.map(([name]) => name);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.HASHPASS_PIN_PEPPER = 'p'.repeat(48);
  mockIdentity.mockResolvedValue({ registryUserId: id });
  mockRpc.mockResolvedValue({ data: {}, error: null });
});
afterAll(() => { delete process.env.HASHPASS_PIN_PEPPER; });

describe('Setup API', () => {
  it('requires authentication and a linked account', async () => {
    mockIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    expect((await GET(new Request(url))).status).toBe(401);
    mockIdentity.mockResolvedValue({ registryUserId: null });
    expect((await GET(new Request(url))).status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('reads with the verified identity and never caches', async () => {
    const response = await GET(new Request(url));
    expect(mockRpc).toHaveBeenCalledWith('get_user_setup', { p_user_id: id });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
  it('requires a bearer for writes, ignoring ambient cookies', async () => {
    const response = await call(POST, { step: 1 }, { 'Content-Type': 'application/json', Cookie: 'session=abc' });
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('saves with the verified identity, ignoring a forged actor in the body', async () => {
    expect((await call(POST, { step: 2, goals: ['learn'], userId: 'someone-else' })).status).toBe(400);
    expect((await call(POST, { step: 2, goals: ['learn'], topics: ['AI'] })).status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('save_user_setup', { p_user_id: id, p_patch: { step: 2, goals: ['learn'], topics: ['AI'] } });
  });
  it.each([
    { step: 4 }, { step: -1 }, { step: 1.5 }, { goals: ['learn', 'learn'] }, { goals: ['hire', 'learn', 'friends', 'investors'] },
    { goals: ['conquer'] }, { goals: 'learn' }, { topics: ['AI', 'Web3', 'Design', 'Startups', 'Payments', 'Gaming'] },
    { topics: ['Cooking'] }, { privacyScope: 'everyone' }, { consentVersion: 0 }, { consentVersion: '1' }, { complete: 'yes' }, { role: 'admin' },
  ])('rejects %j without touching storage', async patch => {
    expect(validSetupPatch(patch)).toBe(false);
    expect((await call(POST, patch)).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('rejects non-JSON, oversized, and non-object bodies', async () => {
    expect((await call(POST, '{', headers)).status).toBe(400);
    expect((await call(POST, '[]', headers)).status).toBe(400);
    expect((await call(POST, 'x'.repeat(5000), headers)).status).toBe(400);
    expect((await call(POST, { step: 1 }, { Authorization: 'Bearer t', 'Content-Type': 'text/plain' })).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('hides database details and maps constraint violations to 400', async () => {
    mockRpc.mockResolvedValue({ error: { code: '42P01', message: 'relation "user_setup" is secret' } });
    const unavailable = await call(POST, { step: 1 });
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await unavailable.json())).not.toContain('secret');
    mockRpc.mockResolvedValue({ error: { code: '23514', message: 'consent_required' } });
    expect((await call(POST, { complete: true })).status).toBe(400);
  });
});

describe('PIN API', () => {
  const pin = (body: unknown, extra?: Record<string, string>) => call(PIN, body, extra, `${url}/pin`);
  it('requires a bearer and a linked account', async () => {
    expect((await pin({ action: 'verify', pin: '1234', scope: 'app:unlock' }, { 'Content-Type': 'application/json' })).status).toBe(401);
    mockIdentity.mockResolvedValue({ registryUserId: null });
    expect((await pin({ action: 'verify', pin: '1234', scope: 'app:unlock' })).status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it.each([
    { action: 'set', pin: '123' }, { action: 'set', pin: '12345' }, { action: 'set', pin: 1234 }, { action: 'set', pin: '1234', currentPin: 'abcd' },
    { action: 'set', pin: '1234', userId: 'x' }, { action: 'verify', pin: '1234' }, { action: 'verify', pin: '1234', scope: 'root' },
    { action: 'verify', pin: 'abcd', scope: 'app:unlock' }, { action: 'verify', pin: '1234', scope: 'app:unlock', extra: 1 }, { action: 'reset' }, {},
  ])('rejects %j without touching storage', async body => {
    expect((await pin(body)).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('sends only a derived verifier to the database, never the PIN', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, enabled: true, remainingAttempts: 5, lockedUntil: null }, error: null });
    expect((await pin({ action: 'set', pin: '4821' })).status).toBe(200);
    const [, args] = mockRpc.mock.calls[0];
    expect(rpcNames()).toEqual(['set_user_pin']);
    expect(args.p_verifier).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(mockRpc.mock.calls)).not.toContain('4821');
    expect(args.p_current).toBeNull();
  });
  it('derives the current PIN the same way when changing it', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, enabled: true, remainingAttempts: 5, lockedUntil: null }, error: null });
    await pin({ action: 'set', pin: '4821', currentPin: '1111' });
    const [, args] = mockRpc.mock.calls[0];
    expect(args.p_current).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_current).not.toBe(args.p_verifier);
  });
  it('reports an already-set PIN as a conflict', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'pin_already_set' } });
    expect((await pin({ action: 'set', pin: '4821' })).status).toBe(409);
  });
  it('mints a scoped proof for a correct PIN and nothing for a wrong one', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, enabled: true, remainingAttempts: 5, lockedUntil: null }, error: null });
    const good = await (await pin({ action: 'verify', pin: '4821', scope: 'wallet:sign' })).json();
    expect(good.data.ok).toBe(true);
    expect(verifyStepUpProof(good.data.proof.token, { userId: id, scope: 'wallet:sign' })).toBe(true);
    expect(verifyStepUpProof(good.data.proof.token, { userId: id, scope: 'app:unlock' })).toBe(false);
    mockRpc.mockResolvedValueOnce({ data: { ok: false, enabled: true, remainingAttempts: 3, lockedUntil: null }, error: null });
    const bad = await pin({ action: 'verify', pin: '0000', scope: 'wallet:sign' });
    expect(bad.status).toBe(200);
    const body = await bad.json();
    expect(body.data).toEqual({ ok: false, enabled: true, remainingAttempts: 3, lockedUntil: null });
    expect(body.data.proof).toBeUndefined();
  });
  it('surfaces a lockout without issuing a proof', async () => {
    const lockedUntil = '2030-01-01T00:00:00.000Z';
    mockRpc.mockResolvedValue({ data: { ok: false, enabled: true, remainingAttempts: 0, lockedUntil }, error: null });
    const body = await (await pin({ action: 'verify', pin: '4821', scope: 'app:unlock' })).json();
    expect(body.data).toMatchObject({ ok: false, remainingAttempts: 0, lockedUntil });
    expect(body.data.proof).toBeUndefined();
  });
  it('fails closed, without leaking why, when the pepper is missing', async () => {
    delete process.env.HASHPASS_PIN_PEPPER;
    const response = await pin({ action: 'verify', pin: '4821', scope: 'app:unlock' });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/pepper|HASHPASS/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
