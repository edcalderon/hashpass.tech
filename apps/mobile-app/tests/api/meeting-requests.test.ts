/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockIsResolveIdentityError = jest.fn();

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (request: Request) => mockResolveNotificationIdentity(request),
  isResolveIdentityError: (identity: unknown) => mockIsResolveIdentityError(identity),
}));

jest.mock('@/lib/supabase-server', () => {
  function createChain(): { eq: jest.Mock; order: jest.Mock } {
    return {
      eq: jest.fn(() => createChain()),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
  }

  return {
    getSupabaseServerForRequest: () => ({
      from: jest.fn(() => ({
        select: jest.fn(() => createChain()),
      })),
    }),
  };
});

describe('meeting-requests api', () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockIsResolveIdentityError.mockReset();
  });

  describe('GET', () => {
    it('returns empty array when user has no supabase id', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: null });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/bslatam/meeting-requests+api');
      const response = await GET(
        new Request(
          'https://api.hashpass.tech/api/bslatam/meeting-requests?speakerId=550e8400-e29b-41d4-a716-446655440000'
        )
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [] });
    });

    it('returns 400 when speakerId is missing', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'user-123' });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/bslatam/meeting-requests+api');
      const response = await GET(new Request('https://api.hashpass.tech/api/bslatam/meeting-requests'));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'speakerId is required' });
    });

    it('returns empty array when speakerId is not a valid UUID', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'user-123' });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/bslatam/meeting-requests+api');
      const response = await GET(
        new Request('https://api.hashpass.tech/api/bslatam/meeting-requests?speakerId=claudia-sotelo')
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [] });
    });

    it('returns identity error if identity resolution fails', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 });
      mockIsResolveIdentityError.mockReturnValue(true);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/bslatam/meeting-requests+api');
      const response = await GET(
        new Request(
          'https://api.hashpass.tech/api/bslatam/meeting-requests?speakerId=550e8400-e29b-41d4-a716-446655440000'
        )
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });
  });
});
