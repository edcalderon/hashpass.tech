/// <reference types="jest" />

const mockNormalizeKapsoWebhook = jest.fn();
const mockInsert = jest.fn();

jest.mock('@hashpass/support-kapso', () => ({
  normalizeKapsoWebhook: (...args: unknown[]) => mockNormalizeKapsoWebhook(...args),
}));

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({
    from: () => ({ insert: (...args: unknown[]) => mockInsert(...args) }),
  }),
}));

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('https://api.hashpass.tech/api/v1/integrations/kapso/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-signature': 'sha256=deadbeef', 'x-idempotency-key': 'evt-1', ...headers },
    body,
  });
}

describe('POST /api/v1/integrations/kapso/webhook', () => {
  beforeEach(() => {
    jest.resetModules();
    mockNormalizeKapsoWebhook.mockReset();
    mockInsert.mockReset();
    process.env.KAPSO_WEBHOOK_SECRET = 'example-fixture-value';
  });

  afterAll(() => {
    delete process.env.KAPSO_WEBHOOK_SECRET;
  });

  it('fails closed when no webhook secret is configured', async () => {
    delete process.env.KAPSO_WEBHOOK_SECRET;
    const { POST } = require('../../../../../app/api/v1/integrations/kapso/webhook+api');

    const response = await POST(makeRequest('{}'));

    expect(response.status).toBe(500);
    expect(mockNormalizeKapsoWebhook).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature with 401 and never persists the payload', async () => {
    mockNormalizeKapsoWebhook.mockImplementation(() => {
      throw new Error('Invalid Kapso webhook signature');
    });
    const { POST } = require('../../../../../app/api/v1/integrations/kapso/webhook+api');

    const response = await POST(makeRequest('{"type":"message"}'));

    expect(response.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('accepts a valid signature, verifies it against the raw body, and persists the event', async () => {
    mockNormalizeKapsoWebhook.mockReturnValue({
      idempotencyKey: 'evt-1',
      signature: 'deadbeef',
      rawBody: Buffer.from('{"type":"message"}'),
      payload: { type: 'message' },
    });
    mockInsert.mockResolvedValue({ error: null });

    const { POST } = require('../../../../../app/api/v1/integrations/kapso/webhook+api');
    const rawBody = '{"type":"message"}';
    const response = await POST(makeRequest(rawBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'accepted' });
    // Verification must run over the raw, unparsed body -- not a re-serialized object.
    expect(mockNormalizeKapsoWebhook).toHaveBeenCalledWith(rawBody, expect.any(Object), 'example-fixture-value');
    expect(mockInsert).toHaveBeenCalledWith({ idempotency_key: 'evt-1', payload: { type: 'message' } });
  });

  it('treats a redelivered event (unique_violation) as a successful duplicate, not an error', async () => {
    mockNormalizeKapsoWebhook.mockReturnValue({
      idempotencyKey: 'evt-1',
      signature: 'deadbeef',
      rawBody: Buffer.from('{}'),
      payload: {},
    });
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    const { POST } = require('../../../../../app/api/v1/integrations/kapso/webhook+api');
    const response = await POST(makeRequest('{}'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'duplicate' });
  });

  it('returns 500 on a genuine persistence failure', async () => {
    mockNormalizeKapsoWebhook.mockReturnValue({
      idempotencyKey: 'evt-1',
      signature: 'deadbeef',
      rawBody: Buffer.from('{}'),
      payload: {},
    });
    mockInsert.mockResolvedValue({ error: { code: '500', message: 'connection reset' } });

    const { POST } = require('../../../../../app/api/v1/integrations/kapso/webhook+api');
    const response = await POST(makeRequest('{}'));

    expect(response.status).toBe(500);
  });
});
