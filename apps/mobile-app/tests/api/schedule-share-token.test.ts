/// <reference types="jest" />

const mockResolveIdentity = jest.fn();
const mockIsIdentityError = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveIdentity(...args),
  isResolveIdentityError: (value: unknown) => mockIsIdentityError(value),
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

const query = (result: unknown, error: unknown = null) => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: jest.fn().mockResolvedValue({ data: result, error }),
    insert: () => chain,
    single: jest.fn().mockResolvedValue({ data: result, error }),
  };
  return chain;
};

describe('schedule share-token route', () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveIdentity.mockReset();
    mockIsIdentityError.mockReset().mockReturnValue(false);
    mockFrom.mockReset();
  });

  it('reuses an existing token for the authenticated registry user', async () => {
    mockResolveIdentity.mockResolvedValue({ registryUserId: '11111111-1111-4111-8111-111111111111', supabaseUserId: null });
    mockFrom.mockReturnValue(query({ share_token: 'existing-token' }));

    const { POST } = require('../../app/api/events/[eventId]/schedule/share-token+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/events/chile2026/schedule/share-token', { method: 'POST' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ shareToken: 'existing-token' });
  });

  it('creates a token when no existing share is found', async () => {
    mockResolveIdentity.mockResolvedValue({ registryUserId: '22222222-2222-4222-8222-222222222222', supabaseUserId: null });
    const existing = query(null);
    const inserted = query({ share_token: 'new-token' });
    mockFrom.mockReturnValueOnce(existing).mockReturnValueOnce(inserted);

    const { POST } = require('../../app/api/events/[eventId]/schedule/share-token+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/events/chile2026/schedule/share-token', { method: 'POST' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ shareToken: 'new-token' });
  });

  it('rejects identities that cannot be mapped to a UUID', async () => {
    mockResolveIdentity.mockResolvedValue({ registryUserId: null, supabaseUserId: 'not-a-uuid' });
    const { POST } = require('../../app/api/events/[eventId]/schedule/share-token+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/events/chile2026/schedule/share-token', { method: 'POST' }));
    expect(response.status).toBe(403);
  });
});
