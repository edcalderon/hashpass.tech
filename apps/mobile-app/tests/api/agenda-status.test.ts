/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockIsResolveIdentityError = jest.fn();
const mockFrom = jest.fn();
const mockNot = jest.fn();
const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateEq = jest.fn();
let consoleErrorSpy: jest.SpyInstance;

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (request: Request) => mockResolveNotificationIdentity(request),
  isResolveIdentityError: (identity: unknown) => mockIsResolveIdentityError(identity),
}));

jest.mock('@/lib/supabase-server', () => {
  function createChain(): { eq: jest.Mock; not: jest.Mock; maybeSingle: jest.Mock } {
    return {
      eq: jest.fn(() => createChain()),
      not: mockNot,
      maybeSingle: mockMaybeSingle,
    };
  }

  return {
    getSupabaseServerForRequest: () => ({
      from: mockFrom.mockImplementation(() => ({
        select: jest.fn(() => createChain()),
        insert: mockInsert,
        update: mockUpdate,
      })),
    }),
  };
});

describe('agenda-status api', () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockIsResolveIdentityError.mockReset();
    mockFrom.mockClear();
    mockNot.mockReset();
    mockMaybeSingle.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockUpdateEq.mockReset();
    mockNot.mockResolvedValue({ data: [], error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockInsert.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });
    mockUpdateEq.mockResolvedValue({ error: null });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleErrorSpy.mockRestore());

  describe('GET', () => {
    it('returns empty array when user has no registry id', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: null, registryUserId: null });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/events/[eventId]/agenda/status+api');
      const response = await GET(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda/status')
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [] });
    });

    it('returns 400 when the event id is missing from the URL', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-uuid-123', registryUserId: 'registry-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/events/[eventId]/agenda/status+api');
      const response = await GET(new Request('https://api.hashpass.tech/api/events'));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'A valid event id is required' });
    });

    it('returns identity error if identity resolution fails', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 });
      mockIsResolveIdentityError.mockReturnValue(true);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/events/[eventId]/agenda/status+api');
      const response = await GET(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda/status')
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('returns the authenticated user agenda status for the URL event', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: 'auth-uuid-123',
        registryUserId: 'registry-id-123',
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockNot.mockResolvedValueOnce({
        data: [{ agenda_id: 'agenda-1', status: 'confirmed', is_favorite: true }],
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/events/[eventId]/agenda/status+api');
      const response = await GET(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda/status')
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: [{ agenda_id: 'agenda-1', status: 'confirmed', is_favorite: true }],
      });
    });

    it('returns a safe error when the agenda-status query fails', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: 'auth-uuid-123',
        registryUserId: 'registry-id-123',
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockNot.mockResolvedValueOnce({ data: null, error: new Error('offline') });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/events/[eventId]/agenda/status+api');
      const response = await GET(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda/status')
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to fetch agenda status' });
    });
  });

  describe('POST', () => {
    it('returns 403 when user has no registry id', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: null, registryUserId: null });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require('../../app/api/events/[eventId]/agenda/status+api');
      const response = await POST(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agendaId: 'agenda-1', status: 'confirmed' }),
        })
      );

      expect(response.status).toBe(403);
    });

    it('returns 400 when agendaId is missing', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-uuid-123', registryUserId: 'registry-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require('../../app/api/events/[eventId]/agenda/status+api');
      const response = await POST(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        })
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'agendaId is required' });
    });

    it('returns 400 when neither status nor isFavorite is provided', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-uuid-123', registryUserId: 'registry-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require('../../app/api/events/[eventId]/agenda/status+api');
      const response = await POST(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agendaId: 'agenda-1' }),
        })
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'status or isFavorite is required' });
    });

    it('inserts new agenda status', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-uuid-123', registryUserId: 'registry-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require('../../app/api/events/[eventId]/agenda/status+api');
      const response = await POST(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agendaId: 'agenda-1', status: 'confirmed' }),
        })
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });

    it('updates an existing agenda status instead of inserting a second row', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: 'auth-uuid-123',
        registryUserId: 'registry-id-123',
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'status-1' }, error: null });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require('../../app/api/events/[eventId]/agenda/status+api');
      const response = await POST(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agendaId: 'agenda-1', isFavorite: true }),
        })
      );

      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('returns a safe error when the existing-status lookup fails', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: 'auth-uuid-123',
        registryUserId: 'registry-id-123',
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: new Error('offline') });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require('../../app/api/events/[eventId]/agenda/status+api');
      const response = await POST(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agendaId: 'agenda-1', status: 'confirmed' }),
        })
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to update agenda status' });
    });
  });
});
