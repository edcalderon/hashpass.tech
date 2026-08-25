/// <reference types="jest" />

const mockRateLimitOk = jest.fn((_key: string) => true);
const mockAuthorizeEventAdmin = jest.fn();
const mockGetEventSupabaseProfileId = jest.fn(() => 'core-production');
const mockGetSupabaseServerForRequest = jest.fn();

jest.mock('@/lib/bsl/rateLimit', () => ({ rateLimitOk: (key: string) => mockRateLimitOk(key) }));
jest.mock('@/lib/server/event-admin', () => ({ authorizeEventAdmin: (...args: unknown[]) => mockAuthorizeEventAdmin(...args) }));
jest.mock('@/lib/server/event-supabase-profile', () => ({ getEventSupabaseProfileId: () => mockGetEventSupabaseProfileId() }));
jest.mock('@/lib/supabase-server', () => ({ getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args) }));

function query(result: { data: unknown; error: unknown }) {
  const value: Record<string, any> = {
    select: jest.fn(() => value),
    eq: jest.fn(() => value),
    maybeSingle: jest.fn(async () => result),
    upsert: jest.fn(() => value),
    single: jest.fn(async () => result),
  };
  return value;
}

describe('auth allies API routes', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRateLimitOk.mockReset().mockReturnValue(true);
    mockAuthorizeEventAdmin.mockReset();
    mockGetSupabaseServerForRequest.mockReset();
  });

  it('rejects invalid and rate-limited admin requests before authorizing', async () => {
    const { GET } = require('../../app/api/admin/auth-allies+api');
    const invalid = await GET(new Request('https://api.hashpass.tech/api/admin/auth-allies?eventId=nope'));
    expect(invalid.status).toBe(400);
    expect(mockAuthorizeEventAdmin).not.toHaveBeenCalled();

    mockRateLimitOk.mockReturnValueOnce(false);
    const limited = await GET(new Request('https://api.hashpass.tech/api/admin/auth-allies?eventId=bsl'));
    expect(limited.status).toBe(429);
  });

  it('reads the saved admin override and persists normalized updates', async () => {
    const readQuery = query({ data: { allowed_ally_ids: ['bsl'], updated_at: '2026-08-25T00:00:00Z' }, error: null });
    const writeQuery = query({ data: { allowed_ally_ids: ['bsl'], updated_at: '2026-08-25T01:00:00Z' }, error: null });
    const from = jest.fn().mockReturnValueOnce(readQuery).mockReturnValueOnce(writeQuery);
    mockAuthorizeEventAdmin.mockResolvedValue({ userId: 'admin-1', supabase: { from } });
    const route = require('../../app/api/admin/auth-allies+api');

    const read = await route.GET(new Request('https://api.hashpass.tech/api/admin/auth-allies?eventId=bsl'));
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({ data: { allowedAllyIds: ['hash-poker-room', 'bsl'] } });

    const write = await route.POST(new Request('https://api.hashpass.tech/api/admin/auth-allies', {
      method: 'POST', body: JSON.stringify({ eventId: 'bsl', allowedAllyIds: ['bsl', 'unknown'] }),
    }));
    expect(write.status).toBe(200);
    expect(writeQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({ allowed_ally_ids: ['hash-poker-room', 'bsl'], updated_by: 'admin-1' }), { onConflict: 'event_id' });
  });

  it('uses a safe configured fallback when the public settings query fails', async () => {
    const failingQuery = query({ data: null, error: { message: 'offline' } });
    mockGetSupabaseServerForRequest.mockReturnValue({ from: jest.fn(() => failingQuery) });
    const { GET } = require('../../app/api/events/[eventId]/auth-allies+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/events/bsl/auth-allies'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toHaveProperty('data.allowedAllyIds');
  });

  it('returns an override for a known public event and rejects unknown events', async () => {
    const savedQuery = query({ data: { allowed_ally_ids: ['bsl'] }, error: null });
    mockGetSupabaseServerForRequest.mockReturnValue({ from: jest.fn(() => savedQuery) });
    const { GET } = require('../../app/api/events/[eventId]/auth-allies+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/events/bsl/auth-allies'));
    await expect(response.json()).resolves.toEqual({ data: { allowedAllyIds: ['hash-poker-room', 'bsl'] } });
    const missing = await GET(new Request('https://api.hashpass.tech/api/events/nope/auth-allies'));
    expect(missing.status).toBe(404);
  });
});
