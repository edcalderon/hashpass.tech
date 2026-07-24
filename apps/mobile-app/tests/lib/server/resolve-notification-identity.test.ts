/// <reference types="jest" />

const mockAuthenticateRequest = jest.fn();
const mockExtractToken = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn();

jest.mock('@hashpass/auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  extractToken: (...args: unknown[]) => mockExtractToken(...args),
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args),
}));

describe('resolveNotificationIdentity', () => {
  beforeEach(() => {
    jest.resetModules();
    mockAuthenticateRequest.mockReset();
    mockExtractToken.mockReset();
    mockGetSupabaseServerForRequest.mockReset();
    mockExtractToken.mockReturnValue(null);
  });

  it('maps a Directus session to its linked Supabase UUID through the email registry', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { provider_ids: { supabase: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4' } },
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    mockGetSupabaseServerForRequest.mockReturnValue({ from, auth: { getUser: jest.fn() } });
    mockAuthenticateRequest.mockResolvedValue({
      user: { id: 'directus-user-id', email: 'Edward@Hashpass.App' },
      error: null,
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { resolveNotificationIdentity } = require('../../../lib/server/resolve-notification-identity');
    const identity = await resolveNotificationIdentity(new Request('https://api.hashpass.tech/api/admin/access'));

    expect(identity).toEqual({
      supabaseUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      email: 'edward@hashpass.app',
    });
    expect(from).toHaveBeenCalledWith('user');
    expect(eq).toHaveBeenCalledWith('email', 'edward@hashpass.app');
  });
});
