/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockIsResolveIdentityError = jest.fn();
const mockFrom = jest.fn();
const mockNot = jest.fn();
const mockInsert = jest.fn();
// Resolves the `.select('id')` at the end of the update-first attempt:
// `.update(patch).eq().eq().eq().select('id')` -> { data, error }.
const mockUpdateSelect = jest.fn();
// Resolves the retry-after-conflict update, which is awaited directly with
// no `.select()`: `.update(patch).eq().eq().eq()` -> { error }.
const mockUpdateNoSelect = jest.fn();
let consoleErrorSpy: jest.SpyInstance;

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (request: Request) => mockResolveNotificationIdentity(request),
  isResolveIdentityError: (identity: unknown) => mockIsResolveIdentityError(identity),
}));

jest.mock('@/lib/supabase-server', () => {
  function createSelectChain(): { eq: jest.Mock; not: jest.Mock } {
    return {
      eq: jest.fn(() => createSelectChain()),
      not: mockNot,
    };
  }

  function createUpdateChain(): any {
    const chain: any = {
      eq: jest.fn(() => chain),
      select: jest.fn(() => mockUpdateSelect()),
      // Awaiting the chain directly (the retry path never calls .select())
      // resolves via mockUpdateNoSelect instead.
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve(mockUpdateNoSelect()).then(onFulfilled, onRejected),
    };
    return chain;
  }

  return {
    getSupabaseServerForRequest: () => ({
      from: mockFrom.mockImplementation(() => ({
        select: jest.fn(() => createSelectChain()),
        insert: mockInsert,
        update: jest.fn(() => createUpdateChain()),
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
    mockInsert.mockReset();
    mockUpdateSelect.mockReset();
    mockUpdateNoSelect.mockReset();
    mockNot.mockResolvedValue({ data: [], error: null });
    // Default: the update-first attempt touches no row, so POST falls
    // through to insert.
    mockUpdateSelect.mockResolvedValue({ data: [], error: null });
    mockUpdateNoSelect.mockResolvedValue({ error: null });
    mockInsert.mockResolvedValue({ error: null });
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
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: '11111111-1111-4111-8111-111111111111', registryUserId: '22222222-2222-4222-8222-222222222222' });
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
        supabaseUserId: '11111111-1111-4111-8111-111111111111',
        registryUserId: '22222222-2222-4222-8222-222222222222',
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
        supabaseUserId: '11111111-1111-4111-8111-111111111111',
        registryUserId: '22222222-2222-4222-8222-222222222222',
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
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: '11111111-1111-4111-8111-111111111111', registryUserId: '22222222-2222-4222-8222-222222222222' });
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
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: '11111111-1111-4111-8111-111111111111', registryUserId: '22222222-2222-4222-8222-222222222222' });
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

    it('inserts new agenda status when the update-first attempt touches no row', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: '11111111-1111-4111-8111-111111111111', registryUserId: '22222222-2222-4222-8222-222222222222' });
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
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });

    it('uses the linked Supabase UUID when the provider registry id is opaque text', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: '11111111-1111-4111-8111-111111111111',
        registryUserId: 'better-auth-user-123',
      });
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
      expect(mockFrom).toHaveBeenCalledWith('user_agenda_status');
    });

    it('updates an existing agenda status instead of inserting a second row', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: '11111111-1111-4111-8111-111111111111',
        registryUserId: '22222222-2222-4222-8222-222222222222',
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      // The update-first attempt touches an existing row.
      mockUpdateSelect.mockResolvedValueOnce({ data: [{ id: 'status-1' }], error: null });

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
      expect(mockUpdateSelect).toHaveBeenCalledTimes(1);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('returns a safe error when the update-first attempt fails', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: '11111111-1111-4111-8111-111111111111',
        registryUserId: '22222222-2222-4222-8222-222222222222',
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockUpdateSelect.mockResolvedValueOnce({ data: null, error: new Error('offline') });

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
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('retries as an update when a concurrent insert wins the race (23505)', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: '11111111-1111-4111-8111-111111111111',
        registryUserId: '22222222-2222-4222-8222-222222222222',
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      // No existing row seen by the update-first attempt...
      mockUpdateSelect.mockResolvedValueOnce({ data: [], error: null });
      // ...but a concurrent request inserts first, so our insert loses the race.
      mockInsert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } });
      // The retry update (no .select()) then succeeds.
      mockUpdateNoSelect.mockResolvedValueOnce({ error: null });

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
      expect(await response.json()).toEqual({ success: true });
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockUpdateNoSelect).toHaveBeenCalledTimes(1);
    });

    it('returns a safe error when insert fails for a reason other than a conflict', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: '11111111-1111-4111-8111-111111111111',
        registryUserId: '22222222-2222-4222-8222-222222222222',
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockUpdateSelect.mockResolvedValueOnce({ data: [], error: null });
      mockInsert.mockResolvedValueOnce({ error: new Error('offline') });

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
      expect(mockUpdateNoSelect).not.toHaveBeenCalled();
    });
  });
});
