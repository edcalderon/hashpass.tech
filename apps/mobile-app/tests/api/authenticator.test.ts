const mockIdentity = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockIdentity(...args),
  isResolveIdentityError: (v: { status?: number }) => typeof v.status === 'number',
}));
jest.mock('../../lib/supabase-server', () => ({ getSupabaseServerForRequest: () => ({ rpc: mockRpc }) }));
import { GET, POST } from '../../app/api/setup/authenticator+api';
import { issueStepUpProof } from '../../lib/server/pin-auth';
import { authenticatorCode, sealAuthenticatorSecret, verifyAuthenticatorProof } from '../../lib/server/authenticator';
const userId = '00000000-0000-4000-8000-000000000001';
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const call = (body: unknown, extra = {}) => POST(new Request('https://localhost/api/setup/authenticator', {
  method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body),
}));
const pin = () => ({ 'X-Hashpass-Step-Up': issueStepUpProof(userId, 'wallet:unlock').token });
beforeEach(() => {
  jest.clearAllMocks();
  process.env.HASHPASS_TOTP_KEY = 'ab'.repeat(32); process.env.HASHPASS_PIN_PEPPER = 'p'.repeat(40);
  mockIdentity.mockResolvedValue({ registryUserId: userId });
  mockRpc.mockResolvedValue({ data: null, error: null });
});
afterAll(() => { delete process.env.HASHPASS_TOTP_KEY; delete process.env.HASHPASS_PIN_PEPPER; });
it('denies anonymous access and requires bearer-only mutations', async () => {
  mockIdentity.mockResolvedValue({ error: 'unauthorized', status: 401 });
  expect((await GET(new Request('https://localhost'))).status).toBe(401);
  expect((await POST(new Request('https://localhost', { method: 'POST' }))).status).toBe(401);
  expect(mockRpc).not.toHaveBeenCalled();
});
it('returns only enrollment status, never encrypted secrets', async () => {
  mockRpc.mockResolvedValue({ data: { enabled: true, secret: 'private' }, error: null });
  const response = await GET(new Request('https://localhost'));
  expect(await response.json()).toEqual({ success: true, data: { enabled: true } });
  expect(response.headers.get('Cache-Control')).toContain('no-store');
});
it('requires a PIN proof before starting or confirming enrollment', async () => {
  expect((await call({ action: 'begin' })).status).toBe(403);
  expect((await call({ action: 'confirm', scope: 'access', code: '123456' })).status).toBe(403);
  expect(mockRpc).not.toHaveBeenCalled();
});
it('generates a compatible URI but does not activate before code confirmation', async () => {
  mockRpc.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: true });
  const response = await call({ action: 'begin' }, pin());
  const body = await response.json();
  expect(body.data.secret).toMatch(/^[A-Z2-7]{32}$/);
  expect(body.data.uri).toContain('algorithm=SHA1&digits=6&period=30');
  expect(mockRpc.mock.calls.map(([name]) => name)).toEqual(['get_user_authenticator', 'begin_user_authenticator']);
});
it('never overwrites an enabled factor', async () => {
  mockRpc.mockResolvedValue({ data: { enabled: true } });
  expect((await call({ action: 'begin' }, pin())).status).toBe(409);
  expect(mockRpc).toHaveBeenCalledTimes(1);
});
it('confirms atomically and returns eight recovery codes once', async () => {
  mockRpc.mockResolvedValueOnce({ data: { enabled: false, secret: sealAuthenticatorSecret(secret, userId) } }).mockResolvedValueOnce({ data: true });
  const code = authenticatorCode(secret, Math.floor(Date.now() / 30000));
  const response = await call({ action: 'confirm', code, scope: 'access' }, pin());
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.data.recoveryCodes).toHaveLength(8);
  expect(verifyAuthenticatorProof(body.data.proof.token, userId, 'access')).toBe(true);
  expect(mockRpc).toHaveBeenLastCalledWith('consume_user_authenticator', expect.objectContaining({ p_enroll: true, p_counter: expect.any(Number), p_recovery_hashes: expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/)]) }));
});
it('never mints a proof after a rejected, replayed or locked code', async () => {
  mockRpc.mockResolvedValueOnce({ data: { enabled: true, secret: sealAuthenticatorSecret(secret, userId) } }).mockResolvedValueOnce({ data: false });
  const response = await call({ action: 'verify', code: '000000', scope: 'critical' });
  expect(response.status).toBe(403); expect(await response.json()).not.toHaveProperty('data');
});
it('rejects unrecognized scopes and malformed codes before database access', async () => {
  expect((await call({ action: 'verify', code: '123456', scope: 'admin' })).status).toBe(400);
  expect((await call({ action: 'verify', code: '１２３４５６', scope: 'access' })).status).toBe(400);
  expect(mockRpc).not.toHaveBeenCalled();
});
it('fails closed without a server key', async () => {
  delete process.env.HASHPASS_TOTP_KEY;
  expect((await call({ action: 'begin' }, pin())).status).toBe(503);
});
