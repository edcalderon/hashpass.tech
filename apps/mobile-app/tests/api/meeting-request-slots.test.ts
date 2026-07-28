/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockIsResolveIdentityError = jest.fn();
const mockRpc = jest.fn();
const mockEq = jest.fn();

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (request: Request) =>
    mockResolveNotificationIdentity(request),
  isResolveIdentityError: (identity: unknown) =>
    mockIsResolveIdentityError(identity),
}));

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({
    rpc: mockRpc,
    from: () => ({
      select: () => ({
        eq: (...args: unknown[]) => {
          mockEq(...args);
          return { eq: jest.fn().mockResolvedValue({ data: [], error: null }) };
        },
      }),
    }),
  }),
}));

describe("meeting-request slots api", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockIsResolveIdentityError.mockReset();
    mockRpc.mockReset();
    mockEq.mockReset();
  });

  it("passes the requester to the slot function so both calendars stay conflict-safe", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: "speaker-user-id",
    });
    mockIsResolveIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValue({
      data: [{ slot_time: "2026-08-15T14:00:00.000Z", duration_minutes: 15 }],
      error: null,
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/bslatam/meeting-requests/slots+api");
    const response = await GET(
      new Request(
        "https://api.hashpass.tech/api/bslatam/meeting-requests/slots?speakerId=speaker-user-id&requesterId=requester-user-id&durationMinutes=15",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("get_speaker_available_slots", {
      p_speaker_id: "speaker-user-id",
      p_date: null,
      p_duration_minutes: 15,
      p_requester_id: "requester-user-id",
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
});
