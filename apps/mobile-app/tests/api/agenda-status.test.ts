/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockIsResolveIdentityError = jest.fn();

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (request: Request) => mockResolveNotificationIdentity(request),
  isResolveIdentityError: (identity: unknown) => mockIsResolveIdentityError(identity),
}));

jest.mock('@/lib/supabase-server', () => {
  function createChain(): { eq: jest.Mock; not: jest.Mock; maybeSingle: jest.Mock } {
    return {
      eq: jest.fn(() => createChain()),
      not: jest.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
  }

  return {
    getSupabaseServerForRequest: () => ({
      from: jest.fn(() => ({
        select: jest.fn(() => createChain()),
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
      })),
    }),
  };
});

describe('agenda-status api', () => {
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
      const { GET } = require('../../app/api/bslatam/agenda-status+api');
      const response = await GET(
        new Request('https://api.hashpass.tech/api/bslatam/agenda-status?eventId=chile2026')
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [] });
    });

    it('returns 400 when eventId is missing', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'user-123' });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/bslatam/agenda-status+api');
      const response = await GET(new Request('https://api.hashpass.tech/api/bslatam/agenda-status'));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'eventId is required' });
    });

    it('returns identity error if identity resolution fails', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 });
      mockIsResolveIdentityError.mockReturnValue(true);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/bslatam/agenda-status+api');
      const response = await GET(
        new Request('https://api.hashpass.tech/api/bslatam/agenda-status?eventId=chile2026')
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('POST', () => {
    it('returns 403 when user has no supabase id', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: null });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require('../../app/api/bslatam/agenda-status+api');
      const response = await POST(
        new Request('https://api.hashpass.tech/api/bslatam/agenda-status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eventId: 'chile2026', agendaId: 'agenda-1', status: 'confirmed' }),
        })
      );

      expect(response.status).toBe(403);
    });

    it('returns 400 when eventId or agendaId is missing', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'user-123' });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require('../../app/api/bslatam/agenda-status+api');
      const response = await POST(
        new Request('https://api.hashpass.tech/api/bslatam/agenda-status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eventId: 'chile2026' }),
        })
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'eventId and agendaId are required' });
    });

    it('returns 400 when neither status nor isFavorite is provided', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'user-123' });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require('../../app/api/bslatam/agenda-status+api');
      const response = await POST(
        new Request('https://api.hashpass.tech/api/bslatam/agenda-status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eventId: 'chile2026', agendaId: 'agenda-1' }),
        })
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'status or isFavorite is required' });
    });

    it('inserts new agenda status', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'user-123' });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require('../../app/api/bslatam/agenda-status+api');
      const response = await POST(
        new Request('https://api.hashpass.tech/api/bslatam/agenda-status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eventId: 'chile2026', agendaId: 'agenda-1', status: 'confirmed' }),
        })
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });
  });
});
