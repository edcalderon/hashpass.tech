/// <reference types="jest" />

const mockAuthenticateRequest = jest.fn();
const mockRpc = jest.fn();
const mockResolveNotificationIdentity = jest.fn();
const mockRateLimitOk = jest.fn((_key: string) => true);
const mockGetSupabaseServerForRequest = jest.fn(
  (_request?: unknown, _profileId?: unknown) => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
);

jest.mock("@hashpass/auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: (request: unknown, profileId?: unknown) =>
    mockGetSupabaseServerForRequest(request, profileId),
}));
jest.mock("@/lib/bsl/rateLimit", () => ({
  rateLimitOk: (key: string) => mockRateLimitOk(key),
}));
jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (...args: unknown[]) =>
    mockResolveNotificationIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) =>
    typeof value?.status === "number",
}));

describe("POST /api/admin/passes", () => {
  const actorId = "7f60f5d2-5948-4df1-9670-2f9177cf2fe4";
  const targetId = "8f60f5d2-5948-4df1-9670-2f9177cf2fe4";

  beforeEach(() => {
    jest.resetModules();
    mockAuthenticateRequest.mockReset();
    mockRpc.mockReset();
    mockResolveNotificationIdentity.mockReset();
    mockGetSupabaseServerForRequest.mockClear();
    mockRateLimitOk.mockReturnValue(true);
    mockAuthenticateRequest.mockResolvedValue({
      user: { id: actorId },
      error: null,
    });
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: actorId,
      email: "admin@example.com",
    });
  });

  const post = async (body: Record<string, unknown>) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require("../../app/api/admin/passes+api");
    return POST(
      new Request("https://api.hashpass.tech/api/admin/passes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  };

  const postRaw = async (body: string) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require("../../app/api/admin/passes+api");
    return POST(
      new Request("https://api.hashpass.tech/api/admin/passes", {
        method: "POST",
        body,
      }),
    );
  };

  const get = async (
    query = "eventId=chile2026&limit=50",
    host = "api.hashpass.tech",
  ) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/admin/passes+api");
    return GET(
      new Request(`https://${host}/api/admin/passes?${query}`),
    );
  };

  it("lists active event passes through the protected, paginated RPC", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: [
          { id: "pass-1", status: "active", user_email: "user@example.com" },
        ],
        error: null,
      });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        { id: "pass-1", status: "active", user_email: "user@example.com" },
      ],
      nextCursor: null,
    });
    expect(mockRpc).toHaveBeenLastCalledWith("admin_list_event_passes", {
      p_actor_user_id: actorId,
      p_event_id: "chile2026",
      p_limit: 50,
      p_cursor: null,
    });
  });

  it("routes direct api-dev BSL requests to the development Supabase profile", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    expect((await get("eventId=chile2026", "api-dev.hashpass.tech")).status).toBe(200);
    expect(mockGetSupabaseServerForRequest.mock.calls[0]?.[1]).toBe("bsl-development");
  });

  it("returns a bounded page and cursor when more passes are available", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: [{ id: "pass-1" }, { id: "pass-2" }, { id: "pass-3" }],
        error: null,
      });
    const response = await get("eventId=chile2026&limit=2&cursor=pass-0");
    expect(await response.json()).toEqual({
      data: [{ id: "pass-1" }, { id: "pass-2" }],
      nextCursor: "pass-2",
    });
    expect(mockRpc).toHaveBeenLastCalledWith("admin_list_event_passes", {
      p_actor_user_id: actorId,
      p_event_id: "chile2026",
      p_limit: 2,
      p_cursor: "pass-0",
    });
  });

  it("rejects rate-limited and malformed listing requests before authorization", async () => {
    mockRateLimitOk.mockReturnValueOnce(false);
    expect((await get()).status).toBe(429);
    expect((await get("eventId=invalid/event")).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns a server error when the pass listing RPC fails", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "missing RPC" } });
    expect((await get()).status).toBe(500);
  });

  it("rejects invalid input before authorization or database mutation", async () => {
    const response = await post({
      action: "create",
      eventId: "../other",
      userId: targetId,
      passType: "vip",
    });
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON, missing updates, and unsupported pass values", async () => {
    expect((await postRaw("not-json")).status).toBe(400);
    expect(
      (await post({ action: "update", eventId: "chile2026", passId: "pass-1" }))
        .status,
    ).toBe(400);
    expect(
      (await post({
        action: "create",
        eventId: "chile2026",
        userId: targetId,
        passType: "other",
      })).status,
    ).toBe(400);
    expect(
      (await post({
        action: "update",
        eventId: "chile2026",
        passId: "pass-1",
        status: "revoked",
      })).status,
    ).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("does not mutate passes when the caller lacks event access", async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const response = await post({
      action: "create",
      eventId: "chile2026",
      userId: targetId,
      passType: "vip",
    });
    expect(response.status).toBe(403);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "has_event_admin_access",
      expect.objectContaining({
        p_user_id: actorId,
        p_event_id: "chile2026",
        p_include_moderator: false,
      }),
    );
  });

  it("uses the authenticated actor for an authorized pass mutation", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { id: "pass-1" }, error: null });
    const response = await post({
      action: "create",
      eventId: "chile2026",
      userId: targetId,
      passType: "vip",
    });
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenLastCalledWith(
      "admin_mutate_event_pass",
      expect.objectContaining({
        p_actor_user_id: actorId,
        p_event_id: "chile2026",
        p_user_id: targetId,
        p_pass_type: "vip",
      }),
    );
  });

  it("returns a server error when an authorized pass mutation RPC fails", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "write failed" } });
    const response = await post({
      action: "update",
      eventId: "chile2026",
      passId: "pass-1",
      status: "suspended",
    });
    expect(response.status).toBe(500);
  });

  it("routes complete usage edits to the dedicated usage RPC", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { id: "pass-1" }, error: null });
    const response = await post({
      action: "update",
      eventId: "chile2026",
      passId: "pass-1",
      maxMeetingRequests: 20,
      usedMeetingRequests: 4,
      maxBoostAmount: 300,
      usedBoostAmount: 12,
    });
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenLastCalledWith("admin_update_event_pass_usage", {
      p_actor_user_id: actorId,
      p_event_id: "chile2026",
      p_pass_id: "pass-1",
      p_max_meeting_requests: 20,
      p_used_meeting_requests: 4,
      p_max_boost_amount: 300,
      p_used_boost_amount: 12,
    });
  });

  it("rejects partial, mixed, and non-finite usage updates", async () => {
    expect((await post({
      action: "update", eventId: "chile2026", passId: "pass-1",
      maxMeetingRequests: 20,
    })).status).toBe(400);
    expect((await post({
      action: "update", eventId: "chile2026", passId: "pass-1", passType: "vip",
      maxMeetingRequests: 20, usedMeetingRequests: 4, maxBoostAmount: 300, usedBoostAmount: 12,
    })).status).toBe(400);
    expect((await post({
      action: "update", eventId: "chile2026", passId: "pass-1",
      maxMeetingRequests: "not-a-number", usedMeetingRequests: 4, maxBoostAmount: 300, usedBoostAmount: 12,
    })).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
