/// <reference types="jest" />

const mockGetSupabaseServerForRequest = jest.fn();
const mockVerifyUserToken = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args),
}));

jest.mock('@hashpass/auth', () => ({
  verifyUserToken: (...args: unknown[]) => mockVerifyUserToken(...args),
}));

// Regression tests for a real bug found by code review, confirmed live
// against the deployed schema (packages/tools/scripts + a direct psql
// session): the account-deletion cleanup filtered `meetings` on a
// `user_id` column that doesn't exist on that table at all (the real,
// FK'd pair is host_id/attendee_id), so every deletion attempt silently
// matched zero rows -- caught by the existing try/catch, logged, and still
// reported overall success. meeting_requests only ever cleaned up the
// requester side (received requests, where the user is speaker_id, were
// left behind), and an entirely separate, unencrypted chat system
// (event_chat_messages / event_chat_direct_messages -- distinct from the
// end-to-end encrypted meeting_chat_messages) was never cleaned up at all
// despite the account-deletion disclosure promising complete deletion.
describe('/api/auth/delete-account cleanup coverage', () => {
  const deleteCalls: Array<{ table: string; column: string; value: string }> = [];

  const buildSupabaseMock = () => ({
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { id: 'user-1', email: 'ada@hashpass.tech' } },
      })),
      admin: {
        listUsers: jest.fn(async () => ({
          data: { users: [{ id: 'user-1', email: 'ada@hashpass.tech' }] },
        })),
        deleteUser: jest.fn(async () => ({ error: null })),
      },
    },
    from: (table: string) => ({
      delete: () => ({
        eq: (column: string, value: string) => {
          deleteCalls.push({ table, column, value });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  });

  beforeEach(() => {
    jest.resetModules();
    deleteCalls.length = 0;
    mockGetSupabaseServerForRequest.mockReset();
    mockVerifyUserToken.mockReset();
    mockGetSupabaseServerForRequest.mockReturnValue(buildSupabaseMock());
  });

  const callDeleteAccount = async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../../app/api/auth/delete-account+api');
    return POST(
      new Request('https://api.hashpass.tech/api/auth/delete-account', {
        method: 'POST',
        headers: { authorization: 'Bearer token-1', 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'user-1' }),
      })
    );
  };

  const findCall = (table: string, column: string) =>
    deleteCalls.find((c) => c.table === table && c.column === column && c.value === 'user-1');

  it('deletes meetings by both host_id and attendee_id (the real FK columns) instead of the nonexistent user_id', async () => {
    const response = await callDeleteAccount();

    expect(response.status).toBe(200);
    expect(findCall('meetings', 'host_id')).toBeTruthy();
    expect(findCall('meetings', 'attendee_id')).toBeTruthy();
    expect(deleteCalls.some((c) => c.table === 'meetings' && c.column === 'user_id')).toBe(false);
  });

  it('deletes meeting_requests on both the requester and speaker side', async () => {
    await callDeleteAccount();

    expect(findCall('meeting_requests', 'requester_id')).toBeTruthy();
    expect(findCall('meeting_requests', 'speaker_id')).toBeTruthy();
  });

  it('cleans up event_chat_messages and both sides of event_chat_direct_messages', async () => {
    await callDeleteAccount();

    expect(findCall('event_chat_messages', 'sender_id')).toBeTruthy();
    expect(findCall('event_chat_direct_messages', 'sender_id')).toBeTruthy();
    expect(findCall('event_chat_direct_messages', 'recipient_id')).toBeTruthy();
  });

  it('still deletes the end-to-end encrypted meeting_chat_messages by sender as a defense-in-depth backstop', async () => {
    await callDeleteAccount();

    expect(findCall('meeting_chat_messages', 'sender_id')).toBeTruthy();
  });

  it('still deletes both sides of user_blocks (the pre-existing two-sided cleanup pattern this fix followed)', async () => {
    await callDeleteAccount();

    expect(findCall('user_blocks', 'blocker_user_id')).toBeTruthy();
    expect(findCall('user_blocks', 'blocked_user_id')).toBeTruthy();
  });

  it('deletes the real Supabase auth user and reports success', async () => {
    const response = await callDeleteAccount();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
