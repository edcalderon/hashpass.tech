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
});
