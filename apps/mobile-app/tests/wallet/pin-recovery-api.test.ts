const mockIdentity = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
let mockEnvironment = 'development';
jest.mock('../../lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockIdentity(...args),
  isResolveIdentityError: (v: { status?: number }) => typeof v.status === 'number',
}));
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({}) }) },
}));
jest.mock('../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: mockFrom, rpc: mockRpc }),
  getSupabaseServerEnv: () => ({ environment: mockEnvironment, supabaseServiceKey: 'service-key' }),
}));

import { POST } from '../../app/api/wallet/pin-recovery+api';
import { POST as PIN } from '../../app/api/setup/pin+api';
import { issueStepUpProof, derivePinVerifier } from '../../lib/server/pin-auth';
import { recoveryCodeHash } from '../../lib/server/wallet-pin-recovery';
import { STEP_UP_HEADER } from '../../lib/step-up-session';

const id = '00000000-0000-4000-8000-000000000001';
const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer token' };
const call = (body: unknown, extra: Record<string, string> = {}, proof?: string) =>
  POST(new Request('https://localhost/api/wallet/pin-recovery', {
    method: 'POST', body: JSON.stringify(body),
    headers: { ...headers, ...extra, ...(proof ? { [STEP_UP_HEADER]: proof } : {}) },
  }));
const rpcNames = () => mockRpc.mock.calls.map(([name]) => name);
// One chainable query shape: maybeSingle resolves the cooldown result, insert records its
// payload, and everything else is a no-op link that can be awaited at any point.
let maybeSingleResult: { data: unknown; error: unknown };
let insertPayloads: unknown[] = [];
let query: Record<string, unknown>;
query = {
  select: () => query, eq: () => query, order: () => query, limit: () => query,
  update: () => query,
  maybeSingle: () => Promise.resolve(maybeSingleResult),
  insert: (payload: unknown) => { insertPayloads.push(payload); return { error: null }; },
};

beforeEach(() => {
  jest.clearAllMocks();
  maybeSingleResult = { data: null, error: null };
  insertPayloads = [];
  mockEnvironment = 'development';
  process.env.HASHPASS_PIN_PEPPER = 'p'.repeat(48);
  process.env.HASHPASS_WALLET_SETUP_ENABLED = 'true';
  process.env.NODEMAILER_FROM = 'no-reply@hashpass.tech';
  process.env.NODEMAILER_PASS = '[REDACTED]';
  mockIdentity.mockResolvedValue({ registryUserId: id, email: 'Person@Example.com' });
  mockFrom.mockImplementation(() => query);
});
afterAll(() => {
  delete process.env.HASHPASS_PIN_PEPPER; delete process.env.HASHPASS_WALLET_SETUP_ENABLED;
  delete process.env.NODEMAILER_FROM; delete process.env.NODEMAILER_PASS;
});

describe('wallet pin recovery route', () => {
  it('requires a bearer token, ignoring ambient cookies', async () => {
    const response = await POST(new Request('https://localhost/api/wallet/pin-recovery', {
      method: 'POST', body: JSON.stringify({ action: 'send' }),
      headers: { 'Content-Type': 'application/json', Cookie: 'session=abc' },
    }));
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('is development-only like the vault route', async () => {
    mockEnvironment = 'production';
    expect((await call({ action: 'send' })).status).toBe(503);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('emails a code whose keyed verifier is the only stored value', async () => {
    const response = await call({ action: 'send' });
    expect(response.status).toBe(200);
    expect((await response.json()).sent).toBe(true);
    expect(mockFrom.mock.calls.map(call_ => call_[0])).toEqual(['otp_codes', 'otp_codes', 'otp_codes']);
    const inserted = insertPayloads[0] as { email: string; purpose: string; token_hash: string; code_hmac: string; expires_at: string; used: boolean };
    expect(insertPayloads).toHaveLength(1);
    expect(inserted.email).toBe('person@example.com');
    expect(inserted.purpose).toBe('wallet-pin-reset');
    expect(inserted.used).toBe(false);
    expect(inserted.code_hmac).toMatch(/^[0-9a-f]{64}$/);
    expect(inserted.expires_at).toBeTruthy();
  });
  it('rate limits resends within the cooldown', async () => {
    maybeSingleResult = { data: { created_at: new Date().toISOString() }, error: null };
    expect((await call({ action: 'send' })).status).toBe(429);
  });
  it('verifies the code through the atomic consumer and mints a wallet:recover proof', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, email: 'person@example.com' }, error: null });
    const response = await call({ action: 'verify', code: '123456' });
    expect(response.status).toBe(200);
    const { proof } = await response.json();
    expect(proof.scope).toBe('wallet:recover');
    expect(mockRpc).toHaveBeenCalledWith('consume_email_otp', {
      p_email: 'person@example.com',
      p_code_hmac: recoveryCodeHash('service-key', 'person@example.com', '123456'),
      p_purpose: 'wallet-pin-reset',
    });
  });
  it('rejects a wrong or exhausted code without saying which', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'invalid' }, error: null });
    expect((await call({ action: 'verify', code: '123456' })).status).toBe(403);
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'locked' }, error: null });
    expect((await call({ action: 'verify', code: '123456' })).status).toBe(429);
  });
  it('sets a new PIN only with a recovery proof, storing only the verifier', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });
    const without = await call({ action: 'set-pin', newPin: '9876' });
    expect(without.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalledWith('reset_user_pin', expect.anything());
    const proof = issueStepUpProof(id, 'wallet:recover');
    const withProof = await call({ action: 'set-pin', newPin: '9876' }, {}, proof.token);
    expect(withProof.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('reset_user_pin', { p_user_id: id, p_verifier: derivePinVerifier(id, '9876') });
  });
  it('rejects a set-pin carrying another scope or user proof', async () => {
    const otherUser = issueStepUpProof('00000000-0000-4000-8000-000000000002', 'wallet:recover');
    expect((await call({ action: 'set-pin', newPin: '9876' }, {}, otherUser.token)).status).toBe(403);
    const wrongScope = issueStepUpProof(id, 'wallet:unlock');
    expect((await call({ action: 'set-pin', newPin: '9876' }, {}, wrongScope.token)).status).toBe(403);
  });
  it('rejects malformed actions and bodies before the database', async () => {
    for (const body of [{ action: 'nope' }, { action: 'send', extra: 1 }, { action: 'verify' }, { action: 'verify', code: '12' }, { action: 'set-pin' }, { action: 'set-pin', newPin: '12' }, {}]) {
      expect((await call(body)).status).toBe(400);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('the recovery proof cannot be minted from the PIN it replaces', () => {
  it('rejects wallet:recover as a verify-PIN scope', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, enabled: true, remainingAttempts: 5 }, error: null });
    const response = await PIN(new Request('https://localhost/api/setup/pin', {
      method: 'POST', body: JSON.stringify({ action: 'verify', pin: '1234', scope: 'wallet:recover' }),
      headers,
    }));
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
    // The scopes a PIN can mint stay unchanged.
    for (const scope of ['app:unlock', 'wallet:sign', 'wallet:unlock']) {
      const ok = await PIN(new Request('https://localhost/api/setup/pin', {
        method: 'POST', body: JSON.stringify({ action: 'verify', pin: '1234', scope }),
        headers,
      }));
      expect(ok.status).toBe(200);
    }
  });
});
