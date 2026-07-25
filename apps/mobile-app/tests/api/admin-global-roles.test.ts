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

const listQuery = (result: unknown) => {
  const query: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  query.select = jest.fn().mockReturnValue(query);
  query.in = jest.fn().mockReturnValue(query);
  query.order = jest.fn().mockResolvedValue(result);
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

  it('lists global administrators for an active super admin', async () => {
    mockFrom
      .mockReturnValueOnce(superAdminQuery({ data: [{ role: 'super_admin', expires_at: null }], error: null }))
      .mockReturnValueOnce(listQuery({
        data: [{ id: 'role-1', user_id: '8f60f5d2-5948-4df1-9670-2f9177cf2fe4', role: 'admin' }],
        error: null,
      }));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/global-roles+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/admin/global-roles'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'role-1', user_id: '8f60f5d2-5948-4df1-9670-2f9177cf2fe4', role: 'admin' }],
    });
  });

  it('returns authorization and database failures without exposing administration data', async () => {
    mockResolveNotificationIdentity.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/admin/global-roles+api');
    const unauthorized = await GET(new Request('https://api.hashpass.tech/api/admin/global-roles'));
    expect(unauthorized.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();

    mockResolveNotificationIdentity.mockResolvedValueOnce({
      supabaseUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      email: 'edward@hashpass.app',
    });
    mockFrom
      .mockReturnValueOnce(superAdminQuery({ data: [{ role: 'super_admin', expires_at: null }], error: null }))
      .mockReturnValueOnce(listQuery({ data: null, error: { message: 'query failed' } }));

    const failedList = await GET(new Request('https://api.hashpass.tech/api/admin/global-roles'));
    expect(failedList.status).toBe(500);
  });

  it('validates a JSON request body before checking administrative access', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/global-roles+api');
    const missingJson = await POST(new Request('https://api.hashpass.tech/api/admin/global-roles', { method: 'POST' }));
    expect(missingJson.status).toBe(400);

    const invalidTarget = await POST(new Request('https://api.hashpass.tech/api/admin/global-roles', {
      method: 'POST',
      body: JSON.stringify({ action: 'promote', targetEmail: 'not-an-email' }),
    }));
    expect(invalidTarget.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('lets a super admin revoke by UUID without looking up an email address', async () => {
    const targetUserId = '8f60f5d2-5948-4df1-9670-2f9177cf2fe4';
    const eqRole = jest.fn().mockResolvedValue({ error: null });
    const eqUser = jest.fn().mockReturnValue({ eq: eqRole });
    const remove = jest.fn().mockReturnValue({ eq: eqUser });

    mockFrom
      .mockReturnValueOnce(superAdminQuery({ data: [{ role: 'super_admin', expires_at: null }], error: null }))
      .mockReturnValueOnce({ delete: remove });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/global-roles+api');
    const response = await POST(new Request('https://api.hashpass.tech/api/admin/global-roles', {
      method: 'POST',
      body: JSON.stringify({ action: 'revoke', targetUserId }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { action: 'revoke', email: null, userId: targetUserId, role: 'admin' },
    });
    expect(remove).toHaveBeenCalledWith();
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('does not grant access when target resolution or mutation fails', async () => {
    const targetEq = jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'registry unavailable' } }),
    });
    const targetSelect = jest.fn().mockReturnValue({ eq: targetEq });
    mockFrom
      .mockReturnValueOnce(superAdminQuery({ data: [{ role: 'super_admin', expires_at: null }], error: null }))
      .mockReturnValueOnce({ select: targetSelect });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/admin/global-roles+api');
    const targetFailure = await POST(new Request('https://api.hashpass.tech/api/admin/global-roles', {
      method: 'POST',
      body: JSON.stringify({ action: 'grant', targetEmail: 'new.admin@example.com' }),
    }));
    expect(targetFailure.status).toBe(500);

    const noLinkedMaybeSingle = jest.fn().mockResolvedValue({ data: { provider_ids: {} }, error: null });
    mockFrom
      .mockReturnValueOnce(superAdminQuery({ data: [{ role: 'super_admin', expires_at: null }], error: null }))
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ maybeSingle: noLinkedMaybeSingle }) }) });
    const noLinkedAccount = await POST(new Request('https://api.hashpass.tech/api/admin/global-roles', {
      method: 'POST',
      body: JSON.stringify({ action: 'grant', targetEmail: 'new.admin@example.com' }),
    }));
    expect(noLinkedAccount.status).toBe(400);

    const upsert = jest.fn().mockResolvedValue({ error: { message: 'write failed' } });
    mockFrom
      .mockReturnValueOnce(superAdminQuery({ data: [{ role: 'super_admin', expires_at: null }], error: null }))
      .mockReturnValueOnce({ upsert });
    const mutationFailure = await POST(new Request('https://api.hashpass.tech/api/admin/global-roles', {
      method: 'POST',
      body: JSON.stringify({
        action: 'grant',
        targetUserId: '8f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      }),
    }));
    expect(mutationFailure.status).toBe(500);
  });
});
