/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockIsResolveIdentityError = jest.fn();
const mockRpc = jest.fn();
const mockEq = jest.fn();
let mockMeetingResult: { data: { id: string } | null; error: unknown } = {
  data: { id: "meeting-123" },
  error: null,
};

function createMeetingChain(): {
  eq: (...args: unknown[]) => ReturnType<typeof createMeetingChain>;
  maybeSingle: () => Promise<typeof mockMeetingResult>;
} {
  return {
    eq: (...args: unknown[]) => {
      mockEq(...args);
      return createMeetingChain();
    },
    maybeSingle: () => Promise.resolve(mockMeetingResult),
  };
}

const mockFrom = jest.fn(() => ({ select: () => createMeetingChain() }));

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (request: Request) =>
    mockResolveNotificationIdentity(request),
  isResolveIdentityError: (identity: unknown) =>
    mockIsResolveIdentityError(identity),
}));

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({ from: mockFrom, rpc: mockRpc }),
}));

describe("meeting conflicts resolve api", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockIsResolveIdentityError.mockReset();
    mockRpc.mockReset();
    mockEq.mockReset();
    mockFrom.mockClear();
    mockMeetingResult = { data: { id: "meeting-123" }, error: null };
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => consoleErrorSpy.mockRestore());

  it("rejects identity errors, unlinked accounts, and missing body fields", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({
      error: "Unauthorized",
      status: 401,
    });
    mockIsResolveIdentityError.mockReturnValue(true);

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require("../../app/api/events/[eventId]/meetings/conflicts/resolve+api");
    const unauthorized = await POST(
      new Request("https://api.hashpass.tech/api/events/bsl/meetings/conflicts/resolve", {
        method: "POST",
        body: JSON.stringify({ meetingId: "meeting-123", action: "replace" }),
      }),
    );
    expect(unauthorized.status).toBe(401);

    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: null });
    mockIsResolveIdentityError.mockReturnValue(false);
    const unlinked = await POST(
      new Request("https://api.hashpass.tech/api/events/bsl/meetings/conflicts/resolve", {
        method: "POST",
        body: JSON.stringify({ meetingId: "meeting-123", action: "replace" }),
      }),
    );
    expect(unlinked.status).toBe(403);

    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: "requester-id" });
    const badAction = await POST(
      new Request("https://api.hashpass.tech/api/events/bsl/meetings/conflicts/resolve", {
        method: "POST",
        body: JSON.stringify({ meetingId: "meeting-123", action: "reschedule" }),
      }),
    );
    expect(badAction.status).toBe(400);

    const missingId = await POST(
      new Request("https://api.hashpass.tech/api/events/bsl/meetings/conflicts/resolve", {
        method: "POST",
        body: JSON.stringify({ action: "replace" }),
      }),
    );
    expect(missingId.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 404 when the meeting does not belong to the event in the URL", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: "requester-id" });
    mockIsResolveIdentityError.mockReturnValue(false);
    mockMeetingResult = { data: null, error: null };

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require("../../app/api/events/[eventId]/meetings/conflicts/resolve+api");
    const response = await POST(
      new Request("https://api.hashpass.tech/api/events/chile2026/meetings/conflicts/resolve", {
        method: "POST",
        body: JSON.stringify({ meetingId: "meeting-123", action: "replace" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(mockEq).toHaveBeenCalledWith("event_id", "chile2026");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("calls resolve_meeting_slot_conflict with the authenticated identity and returns its data", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: "requester-id" });
    mockIsResolveIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValue({
      data: { success: true, action: "replace", meeting_id: "meeting-123", status: "confirmed" },
      error: null,
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require("../../app/api/events/[eventId]/meetings/conflicts/resolve+api");
    const response = await POST(
      new Request("https://api.hashpass.tech/api/events/bsl/meetings/conflicts/resolve", {
        method: "POST",
        body: JSON.stringify({ meetingId: "meeting-123", action: "replace" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("resolve_meeting_slot_conflict", {
      p_meeting_id: "meeting-123",
      p_user_id: "requester-id",
      p_action: "replace",
    });
    expect(await response.json()).toEqual({
      data: { success: true, action: "replace", meeting_id: "meeting-123", status: "confirmed" },
    });
  });

  it("surfaces a business rejection from the RPC as a 409", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: "requester-id" });
    mockIsResolveIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValue({
      data: { success: false, error: "not_authorized" },
      error: null,
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require("../../app/api/events/[eventId]/meetings/conflicts/resolve+api");
    const response = await POST(
      new Request("https://api.hashpass.tech/api/events/bsl/meetings/conflicts/resolve", {
        method: "POST",
        body: JSON.stringify({ meetingId: "meeting-123", action: "keep_existing" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not_authorized" });
  });

  it("returns a safe failure when the meeting lookup or RPC call throws", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: "requester-id" });
    mockIsResolveIdentityError.mockReturnValue(false);
    mockRpc.mockRejectedValueOnce(new Error("database unavailable"));

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require("../../app/api/events/[eventId]/meetings/conflicts/resolve+api");
    const response = await POST(
      new Request("https://api.hashpass.tech/api/events/bsl/meetings/conflicts/resolve", {
        method: "POST",
        body: JSON.stringify({ meetingId: "meeting-123", action: "replace" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "database unavailable" });
  });
});
