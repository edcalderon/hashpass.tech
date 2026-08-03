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

describe('listEventAttendees', () => {
  const userId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  // Resolves attendees through admin_list_event_attendees (scoped to the
  // event's passes), not admin_search_active_users (platform-wide, capped at
  // 51) — see the migration-security.test.js contract for the RPC itself.
  it('paginates through every page instead of stopping at the first capped page', async () => {
    const mockRpc = jest.fn();
    const page1 = Array.from({ length: 200 }, (_, i) => ({
      id: `user-${i}`,
      email: `user${i}@example.com`,
      name: null,
      username: null,
      ticket_type: 'general',
    }));
    // Page size is 200; returning 201 rows signals there is another page.
    mockRpc.mockResolvedValueOnce({ data: [...page1, { id: 'user-200', email: 'user200@example.com', name: null, username: null, ticket_type: 'vip' }], error: null });
    mockRpc.mockResolvedValueOnce({ data: [{ id: 'user-200', email: 'user200@example.com', name: null, username: null, ticket_type: 'vip' }], error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { listEventAttendees } = require('../../../lib/server/event-admin');
    const attendees = await listEventAttendees({ rpc: mockRpc }, userId, 'chile2026');

    expect(attendees).toHaveLength(201);
    expect(attendees[200]).toEqual({ id: 'user-200', email: 'user200@example.com', name: null, username: null, ticketType: 'vip' });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'admin_list_event_attendees', {
      p_actor_user_id: userId,
      p_event_id: 'chile2026',
      p_query: '',
      p_limit: 200,
      p_cursor: null,
    });
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'admin_list_event_attendees', {
      p_actor_user_id: userId,
      p_event_id: 'chile2026',
      p_query: '',
      p_limit: 200,
      p_cursor: 'user-199',
    });
  });

  it('skips rows without an email and propagates RPC errors', async () => {
    const mockRpc = jest.fn().mockResolvedValueOnce({
      data: [{ id: 'user-0', email: null, name: null, username: null, ticket_type: 'general' }],
      error: null,
    });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { listEventAttendees } = require('../../../lib/server/event-admin');
    expect(await listEventAttendees({ rpc: mockRpc }, userId, 'chile2026')).toEqual([]);

    const failingRpc = jest.fn().mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } });
    await expect(listEventAttendees({ rpc: failingRpc }, userId, 'chile2026')).rejects.toEqual({ message: 'forbidden' });
  });

  it('treats a null data page as empty instead of throwing', async () => {
    const mockRpc = jest.fn().mockResolvedValueOnce({ data: null, error: null });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { listEventAttendees } = require('../../../lib/server/event-admin');
    expect(await listEventAttendees({ rpc: mockRpc }, userId, 'chile2026')).toEqual([]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('stops instead of looping forever if a "more pages" signal arrives with no usable cursor', async () => {
    const pageSize = 200;
    // 199 valid rows, then the pageSize-th (index 199, the last row of the
    // returned page) has no id, plus one more row past the page boundary to
    // signal "more pages exist" (201 total). Must break instead of retrying
    // with an empty cursor forever.
    const rows = Array.from({ length: pageSize - 1 }, (_, i) => ({ id: `user-${i}`, email: `user${i}@example.com`, name: null, username: null, ticket_type: 'general' }));
    rows.push({ id: undefined as any, email: 'user199@example.com', name: null, username: null, ticket_type: 'general' });
    rows.push({ id: 'user-200', email: 'user200@example.com', name: null, username: null, ticket_type: 'general' });
    const mockRpc = jest.fn().mockResolvedValueOnce({ data: rows, error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { listEventAttendees } = require('../../../lib/server/event-admin');
    const attendees = await listEventAttendees({ rpc: mockRpc }, userId, 'chile2026');

    expect(attendees).toHaveLength(pageSize);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
