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

const roleQuery = (result: unknown) => {
  const query: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  ['select', 'eq', 'in'].forEach((method) => {
    query[method] = jest.fn().mockReturnValue(query);
  });
  query.limit = jest.fn().mockResolvedValue(result);
  return query;
};

describe('authorizeGlobalAdmin', () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockFrom.mockReset();
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      email: 'former.admin@example.com',
    });
  });

  it('rejects an expired global admin assignment', async () => {
    mockFrom.mockReturnValueOnce(roleQuery({
      data: [{ role: 'admin', expires_at: '2020-01-01T00:00:00.000Z' }],
      error: null,
    }));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { authorizeGlobalAdmin } = require('../../../lib/server/global-admin');
    const result = await authorizeGlobalAdmin(new Request('https://api.hashpass.tech/api/qr/admin'));

    expect('response' in result).toBe(true);
    if ('response' in result) {
      expect(result.response.status).toBe(403);
    }
  });

  it('returns the linked user and database client for an active global admin', async () => {
    mockFrom.mockReturnValueOnce(roleQuery({
      data: [{ role: 'admin', expires_at: null }],
      error: null,
    }));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { authorizeGlobalAdmin } = require('../../../lib/server/global-admin');
    const result = await authorizeGlobalAdmin(new Request('https://api.hashpass.tech/api/qr/admin'));

    expect(result).toEqual({
      userId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      supabase: expect.objectContaining({ from: expect.any(Function) }),
    });
  });

  it('returns identity and role-lookup failures without granting access', async () => {
    mockResolveNotificationIdentity.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { authorizeGlobalAdmin } = require('../../../lib/server/global-admin');
    const unauthorized = await authorizeGlobalAdmin(new Request('https://api.hashpass.tech/api/qr/admin'));
    expect('response' in unauthorized).toBe(true);
    if ('response' in unauthorized) expect(unauthorized.response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();

    mockResolveNotificationIdentity.mockResolvedValueOnce({ supabaseUserId: null, email: 'unlinked@example.com' });
    const unlinked = await authorizeGlobalAdmin(new Request('https://api.hashpass.tech/api/qr/admin'));
    expect('response' in unlinked).toBe(true);
    if ('response' in unlinked) expect(unlinked.response.status).toBe(403);

    mockResolveNotificationIdentity.mockResolvedValueOnce({
      supabaseUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      email: 'former.admin@example.com',
    });
    mockFrom.mockReturnValueOnce(roleQuery({ data: null, error: { message: 'database unavailable' } }));
    const databaseFailure = await authorizeGlobalAdmin(new Request('https://api.hashpass.tech/api/qr/admin'));
    expect('response' in databaseFailure).toBe(true);
    if ('response' in databaseFailure) expect(databaseFailure.response.status).toBe(500);
  });
});
