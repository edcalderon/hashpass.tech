/// <reference types="jest" />

const mockGetSupabaseServerForRequest = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: (request: Request) => mockGetSupabaseServerForRequest(request),
}));

type TableState = {
  lookup?: { data: unknown; error: unknown };
  insert?: { error: unknown };
  update?: { error: unknown };
};

const requestFor = (body: unknown, contentType = 'application/json') =>
  new Request('https://api.hashpass.tech/api/lukas/subscribe', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const configureSupabase = (tables: Record<string, TableState>) => {
  mockFrom.mockImplementation((table: string) => {
    const state = tables[table] || {};
    const lookup = state.lookup || { data: null, error: null };
    const insert = state.insert || { error: null };
    const update = state.update || { error: null };
    return {
      select: () => ({ eq: () => ({ maybeSingle: jest.fn().mockResolvedValue(lookup) }) }),
      insert: jest.fn().mockResolvedValue(insert),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue(update),
      }),
    };
  });
  mockGetSupabaseServerForRequest.mockReturnValue({ from: mockFrom });
};

describe('Lukas newsletter API', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFrom.mockReset();
    mockGetSupabaseServerForRequest.mockReset();
  });

  it('exposes the Lukas CORS preflight', async () => {
    const { OPTIONS } = require('../../app/api/lukas/subscribe+api');
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
  });

  it('rejects non-JSON and malformed email submissions', async () => {
    const { POST } = require('../../app/api/lukas/subscribe+api');
    expect((await POST(requestFor({ email: 'reader@example.com' }, 'text/plain'))).status).toBe(400);
    expect((await POST(requestFor({ email: 'not-an-email' }))).status).toBe(400);
    expect(mockGetSupabaseServerForRequest).not.toHaveBeenCalled();
  });

  it('creates a Lukas subscriber and keeps HashPass opt-in independent', async () => {
    configureSupabase({
      lukas_newsletter_subscribers: {},
      newsletter_subscribers: {},
    });
    const { POST } = require('../../app/api/lukas/subscribe+api');
    const response = await POST(requestFor({
      email: ' Reader@Example.com ',
      source: 'landing-hero',
      hashpassOptIn: false,
    }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      alreadySubscribed: false,
      hashpassOptIn: false,
    });
  });

  it('updates an existing subscriber and copies an opted-in email to HashPass', async () => {
    configureSupabase({
      lukas_newsletter_subscribers: {
        lookup: { data: { email: 'reader@example.com', hashpass_opt_in: false }, error: null },
      },
      newsletter_subscribers: {},
    });
    const { POST } = require('../../app/api/lukas/subscribe+api');
    const response = await POST(requestFor({ email: 'reader@example.com', hashpassOptIn: true }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      alreadySubscribed: true,
      hashpassOptIn: true,
    });
  });

  it('returns a service error when Lukas lookup or insert fails', async () => {
    configureSupabase({
      lukas_newsletter_subscribers: { lookup: { data: null, error: { message: 'offline' } } },
    });
    const { POST } = require('../../app/api/lukas/subscribe+api');
    expect((await POST(requestFor({ email: 'reader@example.com' }))).status).toBe(503);

    configureSupabase({
      lukas_newsletter_subscribers: { insert: { error: { code: 'XX', message: 'write failed' } } },
    });
    expect((await POST(requestFor({ email: 'reader@example.com' }))).status).toBe(503);
  });

  it('keeps the Lukas subscription successful when the optional HashPass insert fails', async () => {
    configureSupabase({
      lukas_newsletter_subscribers: {},
      newsletter_subscribers: { insert: { error: { code: 'XX', message: 'write failed' } } },
    });
    const { POST } = require('../../app/api/lukas/subscribe+api');
    const response = await POST(requestFor({ email: 'reader@example.com', hashpassOptIn: true }));
    expect(response.status).toBe(201);
  });

  it('returns a safe error when Supabase throws unexpectedly', async () => {
    mockGetSupabaseServerForRequest.mockImplementation(() => { throw new Error('offline'); });
    const { POST } = require('../../app/api/lukas/subscribe+api');
    expect((await POST(requestFor({ email: 'reader@example.com' }))).status).toBe(500);
  });

  it('continues when the optional HashPass copy reports a lookup failure', async () => {
    configureSupabase({
      lukas_newsletter_subscribers: {},
      newsletter_subscribers: { lookup: { data: null, error: { message: 'not available' } } },
    });
    const { POST } = require('../../app/api/lukas/subscribe+api');
    const response = await POST(requestFor({ email: 'reader@example.com', hashpassOptIn: true }));
    expect(response.status).toBe(201);
  });
});
