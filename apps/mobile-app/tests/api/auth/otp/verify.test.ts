/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

const mockGetSupabaseServerEnv = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn();
const mockHostnameFromRequest = jest.fn();
const mockResolvePublicSupabaseConfig = jest.fn();
const mockSyncPublicUserRegistry = jest.fn(async () => null);

jest.mock('../../../../lib/supabase-server', () => ({
  getSupabaseServerEnv: mockGetSupabaseServerEnv,
  getSupabaseServerForRequest: mockGetSupabaseServerForRequest,
}));

jest.mock('../../../../config/supabase-profiles', () => ({
  hostnameFromRequest: mockHostnameFromRequest,
  resolvePublicSupabaseConfig: mockResolvePublicSupabaseConfig,
}));

jest.mock('../../../../lib/auth/public-user-registry', () => ({
  syncPublicUserRegistry: mockSyncPublicUserRegistry,
}));

const serviceRoleJwtForRef = (ref: string) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64url');
  const payload = Buffer.from(JSON.stringify({ ref, role: 'service_role' }))
    .toString('base64url');

  return `${header}.${payload}.signature`;
};

const createOtpLookupBuilder = () => {
  const builder: Record<string, jest.Mock> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    or: jest.fn(() => builder),
    gt: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => ({
      data: {
        token_hash: 'magiclink::stored-token-hash::123456',
        used: false,
        expires_at: new Date(Date.now() + 60000).toISOString(),
        email: 'user@example.com',
      },
      error: null,
    })),
  };

  return builder;
};

const createOtpUpdateBuilder = () => {
  const builder: Record<string, jest.Mock> = {
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
  };

  return builder;
};

describe('otp verify api', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    mockGetSupabaseServerEnv.mockReset();
    mockGetSupabaseServerForRequest.mockReset();
    mockHostnameFromRequest.mockReset();
    mockResolvePublicSupabaseConfig.mockReset();
    mockSyncPublicUserRegistry.mockReset();

    const lookupBuilder = createOtpLookupBuilder();
    const updateBuilder = createOtpUpdateBuilder();
    const mockFrom = jest
      .fn()
      .mockReturnValueOnce(lookupBuilder)
      .mockReturnValueOnce(updateBuilder);

    mockGetSupabaseServerForRequest.mockReturnValue({
      from: mockFrom,
    });

    mockHostnameFromRequest.mockReturnValue('api-dev.hashpass.tech');
    mockGetSupabaseServerEnv.mockReturnValue({
      selectedProfile: 'core-development',
      usingDevFallback: false,
      supabaseServiceKey: serviceRoleJwtForRef('prod-ref'),
    });

    mockResolvePublicSupabaseConfig.mockImplementation((input?: { profileId?: string }) => {
      if (input?.profileId === 'core-production') {
        return {
          profileId: 'core-production',
          supabaseUrl: 'https://prod-ref.supabase.co',
          supabaseAnonKey: 'prod-anon-key',
        };
      }

      if (input?.profileId === 'core-development' || !input?.profileId) {
        return {
          profileId: 'core-development',
          supabaseUrl: 'https://dev-ref.supabase.co',
          supabaseAnonKey: 'dev-anon-key',
        };
      }

      return {
        profileId: input.profileId,
        supabaseUrl: undefined,
        supabaseAnonKey: undefined,
      };
    });

    global.fetch = jest.fn(async () => new Response(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'user-123',
        email: 'user@example.com',
        app_metadata: {},
        user_metadata: {},
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('verifies OTP with the anon key from the same Supabase project as the service role', async () => {
    const { POST } = require('../../../../app/api/auth/otp/verify+api');

    const response = await POST(
      new Request('https://api-dev.hashpass.tech/api/auth/otp/verify', {
        method: 'POST',
        headers: {
          origin: 'https://dev.hashpass.tech',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'user@example.com',
          code: '123456',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://prod-ref.supabase.co/auth/v1/verify',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'prod-anon-key',
          Authorization: 'Bearer prod-anon-key',
        }),
        body: JSON.stringify({
          token_hash: 'stored-token-hash',
          type: 'magiclink',
        }),
      })
    );
    expect(mockSyncPublicUserRegistry).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        provider: 'supabase',
        authUserId: 'user-123',
        email: 'user@example.com',
      })
    );
  });
});
