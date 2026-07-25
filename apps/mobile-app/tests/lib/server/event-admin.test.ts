/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveNotificationIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === 'number',
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

describe('authorizeEventAdmin', () => {
  const request = new Request('https://api.hashpass.tech/api/admin/roles?eventId=bsl');
  const userId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockRpc.mockReset();
    mockResolveNotificationIdentity.mockResolvedValue({ userId, supabaseUserId: userId, email: 'event.admin@example.com' });
  });

  it('returns the linked caller when the event access RPC approves them', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { authorizeEventAdmin } = require('../../../lib/server/event-admin');
    const result = await authorizeEventAdmin(request, 'bsl');

    expect(result).toEqual({
      userId,
      supabase: expect.objectContaining({ rpc: expect.any(Function) }),
    });
    expect(mockRpc).toHaveBeenCalledWith('has_event_admin_access', {
      p_user_id: userId,
      p_event_id: 'bsl',
      p_include_moderator: false,
    });
  });

  it('returns identity failures without calling the event-access RPC', async () => {
    mockResolveNotificationIdentity.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { authorizeEventAdmin } = require('../../../lib/server/event-admin');
    const unauthorized = await authorizeEventAdmin(request, 'bsl');
    expect('response' in unauthorized).toBe(true);
    if ('response' in unauthorized) expect(unauthorized.response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();

    mockResolveNotificationIdentity.mockResolvedValueOnce({ supabaseUserId: null, email: 'unlinked@example.com' });
    const unlinked = await authorizeEventAdmin(request, 'bsl');
    expect('response' in unlinked).toBe(true);
    if ('response' in unlinked) expect(unlinked.response.status).toBe(403);
  });

  it('denies a failed access check and shields an RPC failure', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { authorizeEventAdmin } = require('../../../lib/server/event-admin');
    const forbidden = await authorizeEventAdmin(request, 'bsl');
    expect('response' in forbidden).toBe(true);
    if ('response' in forbidden) expect(forbidden.response.status).toBe(403);

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } });
    const databaseFailure = await authorizeEventAdmin(request, 'bsl');
    expect('response' in databaseFailure).toBe(true);
    if ('response' in databaseFailure) expect(databaseFailure.response.status).toBe(500);
  });
});
