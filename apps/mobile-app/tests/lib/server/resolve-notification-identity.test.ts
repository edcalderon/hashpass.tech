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

  it('maps a Directus session to its linked Supabase UUID and registry id through the email registry', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'registry-row-id', provider_ids: { supabase: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4' } },
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
      registryUserId: 'registry-row-id',
      email: 'edward@hashpass.app',
    });
    expect(from).toHaveBeenCalledWith('user');
    expect(eq).toHaveBeenCalledWith('email', 'edward@hashpass.app');
  });

  it('keeps the real Supabase UUID and resolves the registry id when a bearer token is valid', async () => {
    const getUser = jest.fn().mockResolvedValue({
      data: { user: { id: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4', email: 'edward@hashpass.app', user_metadata: {} } },
      error: null,
    });
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'registry-row-id' },
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    mockExtractToken.mockReturnValue('supabase-bearer-token');
    mockGetSupabaseServerForRequest.mockReturnValue({ auth: { getUser }, from });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { resolveNotificationIdentity } = require('../../../lib/server/resolve-notification-identity');
    await expect(resolveNotificationIdentity(new Request('https://api.hashpass.tech/api/admin/access')))
      .resolves.toEqual({
        supabaseUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
        registryUserId: 'registry-row-id',
        email: 'edward@hashpass.app',
      });
    expect(mockAuthenticateRequest).not.toHaveBeenCalled();
  });

  it('self-heals a missing registry row for a caller with a valid bearer token', async () => {
    const getUser = jest.fn().mockResolvedValue({
      data: {
        user: {
          id: 'c598c2de-4aa4-4f2d-8a21-68bed0c166fe',
          email: 'newuser@hashpass.app',
          user_metadata: { full_name: 'New User' },
        },
      },
      error: null,
    });
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });
    const rpc = jest.fn().mockResolvedValue({ data: { id: 'newly-created-registry-id' }, error: null });
    mockExtractToken.mockReturnValue('supabase-bearer-token');
    mockGetSupabaseServerForRequest.mockReturnValue({ auth: { getUser }, from, rpc });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { resolveNotificationIdentity } = require('../../../lib/server/resolve-notification-identity');
    const identity = await resolveNotificationIdentity(new Request('https://api.hashpass.tech/api/bslatam/agenda-status'));

    expect(identity).toEqual({
      supabaseUserId: 'c598c2de-4aa4-4f2d-8a21-68bed0c166fe',
      registryUserId: 'newly-created-registry-id',
      email: 'newuser@hashpass.app',
    });
    expect(rpc).toHaveBeenCalledWith(
      'upsert_public_user_registry',
      expect.objectContaining({
        p_payload: expect.objectContaining({
          email: 'newuser@hashpass.app',
          auth_user_id: 'c598c2de-4aa4-4f2d-8a21-68bed0c166fe',
          full_name: 'New User',
        }),
      })
    );
  });

  it('falls back from a rejected bearer lookup to the provider identity', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'registry-row-id', provider_ids: { supabase: '8f60f5d2-5948-4df1-9670-2f9177cf2fe4' } },
      error: null,
    });
    const getUser = jest.fn().mockRejectedValue(new Error('invalid token'));
    mockExtractToken.mockReturnValue('expired-token');
    mockGetSupabaseServerForRequest.mockReturnValue({
      auth: { getUser },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    });
    mockAuthenticateRequest.mockResolvedValue({
      user: { id: 'better-auth-user-id', email: 'event.admin@example.com' },
      error: null,
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { resolveNotificationIdentity } = require('../../../lib/server/resolve-notification-identity');
    await expect(resolveNotificationIdentity(new Request('https://api.hashpass.tech/api/admin/access')))
      .resolves.toEqual({
        supabaseUserId: '8f60f5d2-5948-4df1-9670-2f9177cf2fe4',
        registryUserId: 'registry-row-id',
        email: 'event.admin@example.com',
      });
  });

  it('rejects a provider request without an authenticated user or email', async () => {
    mockGetSupabaseServerForRequest.mockReturnValue({ auth: { getUser: jest.fn() } });
    mockAuthenticateRequest.mockResolvedValueOnce({ user: null, error: 'Unauthorized' });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { resolveNotificationIdentity } = require('../../../lib/server/resolve-notification-identity');
    await expect(resolveNotificationIdentity(new Request('https://api.hashpass.tech/api/admin/access')))
      .resolves.toEqual({ error: 'Unauthorized', status: 401 });

    mockAuthenticateRequest.mockResolvedValueOnce({ user: { id: 'provider-id', email: null }, error: null });
    await expect(resolveNotificationIdentity(new Request('https://api.hashpass.tech/api/admin/access')))
      .resolves.toEqual({ error: 'Authenticated user has no email on record', status: 400 });
  });

  it('returns an unlinked identity when the registry is empty or unavailable', async () => {
    const maybeSingle = jest.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } });
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    };

    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      isResolveIdentityError,
      resolveSupabaseIdentityForUser,
    } = require('../../../lib/server/resolve-notification-identity');

    await expect(resolveSupabaseIdentityForUser(supabase, { id: 'provider-id', email: 'user@example.com' }))
      .resolves.toEqual({ supabaseUserId: null, registryUserId: null, email: 'user@example.com' });
    await expect(resolveSupabaseIdentityForUser(supabase, { id: 'provider-id', email: 'user@example.com' }))
      .resolves.toEqual({ supabaseUserId: null, registryUserId: null, email: 'user@example.com' });
    await expect(resolveSupabaseIdentityForUser(supabase, { id: 'provider-id', email: '   ' }))
      .resolves.toEqual({ supabaseUserId: null, registryUserId: null, email: '' });
    expect(isResolveIdentityError({ error: 'Unauthorized', status: 401 })).toBe(true);
    expect(isResolveIdentityError({ supabaseUserId: null, registryUserId: null, email: '' })).toBe(false);
  });

  it('returns an unlinked identity if registry lookup throws', async () => {
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => { throw new Error('network'); } }) }) }),
    };

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { resolveSupabaseIdentityForUser } = require('../../../lib/server/resolve-notification-identity');
    await expect(resolveSupabaseIdentityForUser(supabase, { id: 'provider-id', email: 'user@example.com' }))
      .resolves.toEqual({ supabaseUserId: null, registryUserId: null, email: 'user@example.com' });
  });
});
