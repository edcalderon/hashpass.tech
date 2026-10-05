/// <reference types="jest" />

const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn();
const mockResolveNotificationIdentity = jest.fn();
const mockIsResolveIdentityError = jest.fn();
let consoleErrorSpy: jest.SpyInstance;

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: mockFrom }),
}));

// The real module pulls in @hashpass/auth (and from there @edcalderon/auth's
// ESM-only dist), which jest-expo's transformIgnorePatterns does not cover --
// mock it like every other API test that touches this guest-vs-authenticated
// gate (see tests/api/meeting-requests.test.ts) instead of letting the real
// implementation load.
jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (request: Request) => mockResolveNotificationIdentity(request),
  isResolveIdentityError: (identity: unknown) => mockIsResolveIdentityError(identity),
}));

function eventsPublicQuery(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: mockMaybeSingle.mockImplementation(() => Promise.resolve(result)),
      })),
    })),
  };
}

function agendaQuery(result: { data: unknown[] | null; error: unknown }) {
  return {
    select: jest.fn(() => ({
      eq: (...args: unknown[]) => {
        mockEq(...args);
        return { order: mockOrder.mockResolvedValue(result) };
      },
    })),
  };
}

describe('event agenda api', () => {
  beforeEach(() => {
    jest.resetModules();
    mockEq.mockReset();
    mockOrder.mockReset();
    mockMaybeSingle.mockReset();
    mockFrom.mockReset();
    mockResolveNotificationIdentity.mockReset();
    mockIsResolveIdentityError.mockReset();
    // Default every test to agenda_public=true so the V109 guest-visibility
    // gate never engages unless a test explicitly sets `events` table data
    // below -- keeps the existing data-shape assertions unrelated to that
    // gate unaffected by its presence.
    mockFrom.mockImplementation((table: string) =>
      table === 'events'
        ? eventsPublicQuery({ data: { agenda_public: true }, error: null })
        : agendaQuery({ data: [], error: null }),
    );
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleErrorSpy.mockRestore());

  it('uses the event id from the URL when fetching agenda sessions', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'events'
        ? eventsPublicQuery({ data: { agenda_public: true }, error: null })
        : agendaQuery({ data: [{ id: 'session-1' }], error: null }),
    );

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/events/[eventId]/agenda+api');
    const response = await GET(
      new Request('https://api.hashpass.tech/api/events/chile2026/agenda'),
    );

    expect(response.status).toBe(200);
    expect(mockEq).toHaveBeenCalledWith('event_id', 'chile2026');
    expect(await response.json()).toEqual({ data: [{ id: 'session-1' }] });
  });

  it('returns CORS metadata for preflight requests', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { OPTIONS } = require('../../app/api/events/[eventId]/agenda+api');
    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
  });

  it('returns a safe error when the agenda query fails', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'events'
        ? eventsPublicQuery({ data: { agenda_public: true }, error: null })
        : agendaQuery({ data: null, error: new Error('offline') }),
    );

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/events/[eventId]/agenda+api');
    const response = await GET(
      new Request('https://api.hashpass.tech/api/events/chile2026/agenda'),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to fetch agenda' });
  });

  it('rejects a route without an event id', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/events/[eventId]/agenda+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/events'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'A valid event id is required' });
  });

  describe('agenda_public=false guest gate (db/migrations/V109)', () => {
    beforeEach(() => {
      mockFrom.mockImplementation((table: string) =>
        table === 'events'
          ? eventsPublicQuery({ data: { agenda_public: false }, error: null })
          : agendaQuery({ data: [{ id: 'session-1' }], error: null }),
      );
    });

    it('hides the real agenda from an unauthenticated guest behind a public:false discriminator instead of a bare empty array', async () => {
      mockIsResolveIdentityError.mockReturnValue(true);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/events/[eventId]/agenda+api');
      const response = await GET(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda'),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [], public: false });
      // The real agenda query must never even run once the caller is
      // confirmed to have no session -- nothing to leak through a timing
      // side-channel or a stray log.
      expect(mockEq).not.toHaveBeenCalled();
    });

    it('still serves the real agenda to a signed-in attendee despite agenda_public=false', async () => {
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/events/[eventId]/agenda+api');
      const response = await GET(
        new Request('https://api.hashpass.tech/api/events/chile2026/agenda'),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [{ id: 'session-1' }] });
    });
  });
});
