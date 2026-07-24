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

const superAdminQuery = (result: unknown) => {
  const query: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  query.select = jest.fn().mockReturnValue(query);
  query.eq = jest.fn().mockReturnValue(query);
  query.limit = jest.fn().mockResolvedValue(result);
  return query;
};

describe('POST /api/admin/global-roles', () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockFrom.mockReset();
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      email: 'edward@hashpass.app',
    });
  });

  it('allows a super admin to grant standard global admin by email', async () => {
    const targetMaybeSingle = jest.fn().mockResolvedValue({
      data: { provider_ids: { supabase: '8f60f5d2-5948-4df1-9670-2f9177cf2fe4' } },
      error: null,
    });
    const targetEq = jest.fn().mockReturnValue({ maybeSingle: targetMaybeSingle });
    const targetSelect = jest.fn().mockReturnValue({ eq: targetEq });
    const upsert = jest.fn().mockResolvedValue({ error: null });

    mockFrom
      .mockReturnValueOnce(superAdminQuery({ data: [{ role: 'super_admin' }], error: null }))
      .mockReturnValueOnce({ select: targetSelect })
      .mockReturnValueOnce({ upsert });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/global-roles+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/global-roles', {
      method: 'POST',
      body: JSON.stringify({ action: 'grant', targetEmail: 'new.admin@example.com' }),
    }));

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: '8f60f5d2-5948-4df1-9670-2f9177cf2fe4', role: 'admin' },
      { onConflict: 'user_id,role' },
    );
  });

  it('rejects a non-super-admin before resolving or mutating the target account', async () => {
    mockFrom.mockReturnValueOnce(superAdminQuery({ data: [], error: null }));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/global-roles+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/global-roles', {
      method: 'POST',
      body: JSON.stringify({ action: 'grant', targetEmail: 'new.admin@example.com' }),
    }));

    expect(response.status).toBe(403);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired super-admin assignment', async () => {
    const targetMaybeSingle = jest.fn().mockResolvedValue({
      data: { provider_ids: { supabase: '8f60f5d2-5948-4df1-9670-2f9177cf2fe4' } },
      error: null,
    });
    const targetEq = jest.fn().mockReturnValue({ maybeSingle: targetMaybeSingle });
    const targetSelect = jest.fn().mockReturnValue({ eq: targetEq });
    const upsert = jest.fn().mockResolvedValue({ error: null });

    mockFrom
      .mockReturnValueOnce(superAdminQuery({
        data: [{ role: 'super_admin', expires_at: '2020-01-01T00:00:00.000Z' }],
        error: null,
      }))
      .mockReturnValueOnce({ select: targetSelect })
      .mockReturnValueOnce({ upsert });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/global-roles+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/global-roles', {
      method: 'POST',
      body: JSON.stringify({ action: 'grant', targetEmail: 'new.admin@example.com' }),
    }));

    expect(response.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });
});
