const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: (...args: unknown[]) => mockSendMail(...args) }) },
}));
jest.mock('../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: mockFrom, rpc: mockRpc }),
  getSupabaseServerEnv: () => ({ supabaseServiceKey: 'service-key' }),
}));

import { POST } from '../../app/api/companion/email-confirm+api';
import {
  confirmCodeHash, createConfirmToken, normalizeConfirmEmail, resolveCompanionOrigin, verifyConfirmToken,
} from '../../lib/server/companion-email-confirm';

const call = (body: unknown, origin = 'https://companion.hashpass.tech') =>
  POST(new Request('https://localhost/api/companion/email-confirm', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Origin: origin },
  }));

let recentResult: { data: unknown; error: unknown };
let insertPayloads: Record<string, unknown>[] = [];
let query: Record<string, unknown>;
query = {
  select: () => query, eq: () => query, gte: () => query, update: () => query,
  order: () => query,
  limit: () => Promise.resolve(recentResult),
  insert: (payload: Record<string, unknown>) => { insertPayloads.push(payload); return { error: null }; },
};

beforeEach(() => {
  jest.clearAllMocks();
  recentResult = { data: [], error: null };
  insertPayloads = [];
  process.env.NODEMAILER_FROM = 'no-reply@hashpass.tech';
  process.env.NODEMAILER_PASS = '[REDACTED]';
  mockSendMail.mockResolvedValue({});
  mockFrom.mockImplementation(() => query);
});
afterAll(() => { delete process.env.NODEMAILER_FROM; delete process.env.NODEMAILER_PASS; });

describe('confirmation token', () => {
  it('round-trips an email and never expires', () => {
    const token = createConfirmToken('service-key', 'person@example.com');
    jest.useFakeTimers().setSystemTime(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);
    expect(verifyConfirmToken('service-key', token)).toBe('person@example.com');
    jest.useRealTimers();
  });
  it('rejects a forged, tampered, re-keyed or malformed token', () => {
    const token = createConfirmToken('service-key', 'person@example.com');
    const [encoded, signature] = token.split('.');
    const other = Buffer.from('victim@example.com').toString('base64url');
    expect(verifyConfirmToken('service-key', `${other}.${signature}`)).toBeNull();
    expect(verifyConfirmToken('service-key', `${encoded}.${signature.slice(0, -2)}AA`)).toBeNull();
    expect(verifyConfirmToken('rotated-key', token)).toBeNull();
    for (const bad of ['', 'x', 'a.b.c', '.', null, 5]) expect(verifyConfirmToken('service-key', bad)).toBeNull();
  });
});

describe('helpers', () => {
  it('normalises emails and refuses junk', () => {
    expect(normalizeConfirmEmail('  Person@Example.COM ')).toBe('person@example.com');
    for (const bad of ['no-at', 'a b@c.d', '', 7, 'x@'.padEnd(400, 'y')]) expect(normalizeConfirmEmail(bad)).toBeNull();
  });
  it('only links to a known Companion origin', () => {
    expect(resolveCompanionOrigin('https://companion-dev.hashpass.tech')).toBe('https://companion-dev.hashpass.tech');
    expect(resolveCompanionOrigin('https://evil.example')).toBe('https://companion.hashpass.tech');
    expect(resolveCompanionOrigin(null)).toBe('https://companion.hashpass.tech');
  });
});

describe('send', () => {
  it('stores only an HMAC, emails the code and a permanent link, and never returns the code', async () => {
    const response = await call({ action: 'send', email: 'Person@Example.com', locale: 'es' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: true });
    expect(insertPayloads).toHaveLength(1);
    const row = insertPayloads[0];
    expect(row.purpose).toBe('companion-email-confirm');
    expect(row.email).toBe('person@example.com');
    expect(row.code_hmac).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toMatch(/"\d{6}"/);
    const ttl = Date.parse(row.expires_at as string) - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000);

    const mail = mockSendMail.mock.calls[0][0];
    const code = /\n(\d{6})\n/.exec(mail.text)?.[1] as string;
    expect(code).toBeTruthy();
    expect(row.code_hmac).toBe(confirmCodeHash('service-key', 'person@example.com', code));
    expect(mail.to).toBe('person@example.com');
    expect(mail.subject).toMatch(/Confirma/);
    const link = /(https:\/\/companion\.hashpass\.tech\/\?confirm=\S+)/.exec(mail.text)?.[1] as string;
    const token = decodeURIComponent(new URL(link).searchParams.get('confirm') as string);
    expect(verifyConfirmToken('service-key', token)).toBe('person@example.com');
  });

  it('rate limits a resend inside the cooldown and past the hourly cap', async () => {
    recentResult = { data: [{ created_at: new Date().toISOString() }], error: null };
    expect((await call({ action: 'send', email: 'p@example.com' })).status).toBe(429);
    const old = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    recentResult = { data: Array.from({ length: 5 }, () => ({ created_at: old })), error: null };
    expect((await call({ action: 'send', email: 'p@example.com' })).status).toBe(429);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('reports a delivery failure without leaking details', async () => {
    mockSendMail.mockRejectedValue(new Error('smtp exploded with secret'));
    const response = await call({ action: 'send', email: 'p@example.com' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'confirmation_unavailable' });
  });

  it('rejects bad input and unknown fields', async () => {
    expect((await call({ action: 'send', email: 'nope' })).status).toBe(400);
    expect((await call({ action: 'send', email: 'p@example.com', extra: 1 })).status).toBe(400);
    expect((await call({ action: 'other', email: 'p@example.com' })).status).toBe(400);
  });
});

describe('verify-code', () => {
  it('consumes the code through the atomic RPC with a keyed hash', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });
    const response = await call({ action: 'verify-code', email: 'P@Example.com', code: '123456' });
    expect(await response.json()).toEqual({ confirmed: true, email: 'p@example.com' });
    expect(mockRpc).toHaveBeenCalledWith('consume_email_otp', {
      p_email: 'p@example.com',
      p_code_hmac: confirmCodeHash('service-key', 'p@example.com', '123456'),
      p_purpose: 'companion-email-confirm',
    });
  });
  it('answers 403 for a wrong or expired code and 429 once locked', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: false, reason: 'invalid' }, error: null });
    expect((await call({ action: 'verify-code', email: 'p@example.com', code: '000000' })).status).toBe(403);
    mockRpc.mockResolvedValueOnce({ data: { ok: false, reason: 'locked' }, error: null });
    expect((await call({ action: 'verify-code', email: 'p@example.com', code: '000000' })).status).toBe(429);
  });
  it('refuses a non six-digit code before touching the database', async () => {
    for (const code of ['12345', '1234567', 'abcdef', 123456]) {
      expect((await call({ action: 'verify-code', email: 'p@example.com', code })).status).toBe(400);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('verify-link', () => {
  it('confirms a valid link and refuses a forged one', async () => {
    const token = createConfirmToken('service-key', 'p@example.com');
    expect(await (await call({ action: 'verify-link', token })).json()).toEqual({ confirmed: true, email: 'p@example.com' });
    expect((await call({ action: 'verify-link', token: `${token}x` })).status).toBe(403);
  });
});
