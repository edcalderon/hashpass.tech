/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveNotificationIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === 'number',
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

const makeQuery = (result: unknown) => {
  const query: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  ['select', 'eq', 'in'].forEach((method) => {
    query[method] = jest.fn().mockReturnValue(query);
  });
  query.then = jest.fn((resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve));
  return query;
};

describe('GET /api/admin/access', () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockFrom.mockReset();
  });

  it('returns the linked account’s global and unexpired event access', async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      email: 'edward@hashpass.app',
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return makeQuery({ data: [{ role: 'admin' }, { role: 'super_admin' }], error: null });
      }
      return makeQuery({
        data: [
          { event_id: 'bsl', role: 'event_admin', expires_at: null },
          { event_id: 'past-event', role: 'moderator', expires_at: '2020-01-01T00:00:00.000Z' },
        ],
        error: null,
      });
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/access+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/admin/access'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        globalRole: 'super_admin',
        eventRoles: [{ eventId: 'bsl', role: 'event_admin' }],
        effectiveRole: {
          role: 'super_admin',
          scope: 'global',
          eventIds: [],
        },
      },
    });
  });

  it('returns an event admin’s event scope for the sidebar and profile', async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: '8f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      email: 'ecalderon@unal.edu.co',
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return makeQuery({ data: [], error: null });
      }
      return makeQuery({
        data: [{ event_id: 'bsl', role: 'event_admin', expires_at: null }],
        error: null,
      });
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/access+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/admin/access'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        globalRole: null,
        eventRoles: [{ eventId: 'bsl', role: 'event_admin' }],
        effectiveRole: {
          role: 'event_admin',
          scope: 'event',
          eventIds: ['bsl'],
        },
      },
    });
  });

  it('does not expose an expired global role as administrative access', async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      email: 'former.admin@example.com',
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return makeQuery({
          data: [{ role: 'admin', expires_at: '2020-01-01T00:00:00.000Z' }],
          error: null,
        });
      }
      return makeQuery({ data: [], error: null });
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/access+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/admin/access'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        globalRole: null,
        eventRoles: [],
        effectiveRole: { role: 'user', scope: 'none', eventIds: [] },
      },
    });
  });

  it('rejects an account without a linked Supabase identity', async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: null,
      email: 'unlinked@example.com',
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/access+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/admin/access'));

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('passes provider-authentication failures through without querying roles', async () => {
    mockResolveNotificationIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/access+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/admin/access'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not return partial access when either role query fails', async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      email: 'edward@hashpass.app',
    });
    mockFrom.mockImplementation((table: string) => makeQuery(
      table === 'user_roles'
        ? { data: [], error: { message: 'global role lookup failed' } }
        : { data: [{ event_id: 'bsl', role: 'event_admin', expires_at: null }], error: null },
    ));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/access+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/admin/access'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to load administrative access' });
  });
});
