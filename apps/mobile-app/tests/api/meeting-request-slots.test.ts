/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockIsResolveIdentityError = jest.fn();
const mockRpc = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();
let mockPendingResult: { data: unknown[] | null; error: unknown } = {
  data: [],
  error: null,
};
let mockSpeakerResult: { data: { user_id: string } | null; error: unknown } = {
  data: { user_id: "speaker-user-id" },
  error: null,
};
let consoleErrorSpy: jest.SpyInstance;

function mockCreatePendingQuery(): {
  eq: (...args: unknown[]) => ReturnType<typeof mockCreatePendingQuery>;
  then: Promise<unknown>["then"];
} {
  return {
    eq: (...args: unknown[]) => {
      mockEq(...args);
      return mockCreatePendingQuery();
    },
    then: (onFulfilled, onRejected) =>
      Promise.resolve(mockPendingResult).then(onFulfilled, onRejected),
  };
}

function mockCreateSpeakerQuery() {
  return {
    eq: (...args: unknown[]) => {
      mockEq(...args);
      return { maybeSingle: jest.fn().mockResolvedValue(mockSpeakerResult) };
    },
  };
}

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (request: Request) =>
    mockResolveNotificationIdentity(request),
  isResolveIdentityError: (identity: unknown) =>
    mockIsResolveIdentityError(identity),
}));

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({
    rpc: mockRpc,
    from: mockFrom.mockImplementation((table: string) => ({
      select: () =>
        table === "bsl_speakers"
          ? mockCreateSpeakerQuery()
          : mockCreatePendingQuery(),
    })),
  }),
}));

describe("meeting-request slots api", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockIsResolveIdentityError.mockReset();
    mockRpc.mockReset();
    mockEq.mockReset();
    mockFrom.mockClear();
    mockPendingResult = { data: [], error: null };
    mockSpeakerResult = { data: { user_id: "speaker-user-id" }, error: null };
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => consoleErrorSpy.mockRestore());

  it("passes the requester to the slot function so both calendars stay conflict-safe", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: "auth-speaker-user-id",
      registryUserId: "speaker-user-id",
    });
    mockIsResolveIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValue({
      data: [{ slot_time: "2026-08-15T14:00:00.000Z", duration_minutes: 15 }],
      error: null,
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/meetings/requests/slots+api");
    const response = await GET(
      new Request(
        "https://api.hashpass.tech/api/events/bsl/meetings/requests/slots?speakerId=speaker-user-id&requesterId=requester-user-id&durationMinutes=15",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("get_speaker_available_slots", {
      p_speaker_id: "speaker-user-id",
      p_date: null,
      p_duration_minutes: 15,
      p_requester_id: "auth-speaker-user-id",
      p_event_id: "bsl",
    });
    expect(mockEq).toHaveBeenCalledWith("speaker_id", "speaker-user-id");
    expect(await response.json()).toEqual({
      data: [
        {
          slot_time: "2026-08-15T14:00:00.000Z",
          duration_minutes: 15,
          pending_request_count: 0,
          is_hot_spot: false,
          capacity_state: "open",
        },
      ],
    });
  });

  it("isolates pending-slot demand to the event in the URL", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: "requester-id",
    });
    mockIsResolveIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValue({ data: [], error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/meetings/requests/slots+api");
    const response = await GET(
      new Request(
        "https://api.hashpass.tech/api/events/chile2026/meetings/requests/slots?speakerId=speaker-id",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockEq).toHaveBeenCalledWith("event_id", "chile2026");
  });

  it("rejects identity errors, unlinked accounts, and missing speakers", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      error: "Unauthorized",
      status: 401,
    });
    mockIsResolveIdentityError.mockReturnValue(true);

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/meetings/requests/slots+api");
    const unauthorized = await GET(
      new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests/slots"),
    );
    expect(unauthorized.status).toBe(401);

    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: null });
    mockIsResolveIdentityError.mockReturnValue(false);
    const unlinked = await GET(
      new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests/slots"),
    );
    expect(unlinked.status).toBe(403);

    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: "requester-id",
    });
    const missingSpeaker = await GET(
      new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests/slots"),
    );
    expect(missingSpeaker.status).toBe(400);
  });

  it("uses the legacy slot function when a tenant has not deployed requester filtering", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: "requester-id",
    });
    mockIsResolveIdentityError.mockReturnValue(false);
    mockRpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202" },
      })
      .mockResolvedValueOnce({
        data: [{ slot_time: "2026-08-15T14:00:00.000Z" }],
        error: null,
      });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/meetings/requests/slots+api");
    const response = await GET(
      new Request(
        "https://api.hashpass.tech/api/events/bsl/meetings/requests/slots?speakerId=speaker-id&requesterId=requester-id",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      "get_speaker_available_slots",
      {
        p_speaker_id: "speaker-id",
        p_date: null,
        p_duration_minutes: 15,
        p_event_id: "bsl",
      },
    );
  });

  it("enriches preferred and availability-window demand into tentative and hot slots", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: "requester-id",
    });
    mockIsResolveIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValue({
      data: [
        { slot_time: "2026-08-15T14:00:00.000Z" },
        { slot_time: "2026-08-15T15:00:00.000Z" },
      ],
      error: null,
    });
    mockPendingResult = {
      data: [
        { preferred_date: "2026-08-15", preferred_time: "14:00:00" },
        { preferred_date: "2026-08-15", preferred_time: "14:00:00" },
        { preferred_date: "2026-08-15", preferred_time: "14:00:00" },
        {
          availability_window_start: "2026-08-15T15:00:00.000Z",
          availability_window_end: "2026-08-15T15:15:00.000Z",
        },
      ],
      error: null,
    };

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/meetings/requests/slots+api");
    const response = await GET(
      new Request(
        "https://api.hashpass.tech/api/events/bsl/meetings/requests/slots?speakerId=speaker-id&durationMinutes=0",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          slot_time: "2026-08-15T14:00:00.000Z",
          pending_request_count: 3,
          is_hot_spot: true,
          capacity_state: "hot",
        },
        {
          slot_time: "2026-08-15T15:00:00.000Z",
          pending_request_count: 1,
          is_hot_spot: false,
          capacity_state: "tentative",
        },
      ],
    });
    expect(mockRpc).toHaveBeenCalledWith("get_speaker_available_slots", {
      p_speaker_id: "speaker-id",
      p_date: null,
      p_duration_minutes: 15,
      p_requester_id: "requester-id",
      p_event_id: "bsl",
    });
  });

  it("returns a safe failure when slots or pending demand cannot be loaded", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: "requester-id",
    });
    mockIsResolveIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "denied" },
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/meetings/requests/slots+api");
    const slotsFailure = await GET(
      new Request(
        "https://api.hashpass.tech/api/events/bsl/meetings/requests/slots?speakerId=speaker-id",
      ),
    );
    expect(slotsFailure.status).toBe(500);

    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    mockPendingResult = {
      data: null,
      error: { message: "pending query failed" },
    };
    const pendingFailure = await GET(
      new Request(
        "https://api.hashpass.tech/api/events/bsl/meetings/requests/slots?speakerId=speaker-id",
      ),
    );
    expect(pendingFailure.status).toBe(500);
  });
});
