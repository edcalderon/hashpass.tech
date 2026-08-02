/// <reference types="jest" />

const mockAuthenticateRequest = jest.fn();
const mockRpc = jest.fn();
const mockResolveNotificationIdentity = jest.fn();
const mockRateLimitOk = jest.fn(() => true);

jest.mock("@hashpass/auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: jest.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
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

describe("GET /api/admin/users", () => {
  const actorId = "7f60f5d2-5948-4df1-9670-2f9177cf2fe4";
  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
    mockRateLimitOk.mockReturnValue(true);
    mockAuthenticateRequest.mockResolvedValue({
      user: { id: actorId },
      error: null,
    });
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: actorId,
    });
  });

  const get = async (query: string) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/admin/users+api");
    return GET(new Request(`https://api.hashpass.tech/api/admin/users?${query}`));
  };

  it("searches confirmed users in bounded pages after event authorization", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: "8f60f5d2-5948-4df1-9670-2f9177cf2fe4",
            email: "ana@example.com",
            name: "Ana",
          },
        ],
        error: null,
      });
    const response = await get("eventId=chile2026&q=ana&limit=25");
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenLastCalledWith("admin_search_active_users", {
      p_actor_user_id: actorId,
      p_event_id: "chile2026",
      p_query: "ana",
      p_limit: 25,
      p_cursor: null,
    });
  });

  it("bounds search input and returns a cursor for another page", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: [{ id: "a" }, { id: "b" }, { id: "c" }],
        error: null,
      });
    const response = await get("eventId=chile2026&q=Ana&limit=2&cursor=previous");
    expect(await response.json()).toEqual({
      data: [{ id: "a" }, { id: "b" }],
      nextCursor: "b",
    });
    expect(mockRpc).toHaveBeenLastCalledWith("admin_search_active_users", {
      p_actor_user_id: actorId,
      p_event_id: "chile2026",
      p_query: "Ana",
      p_limit: 2,
      p_cursor: "previous",
    });
  });

  it("rejects rate-limited and malformed requests before authorization", async () => {
    mockRateLimitOk.mockReturnValueOnce(false);
    expect((await get("eventId=chile2026")).status).toBe(429);
    expect((await get("eventId=not/valid")).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("does not search when the caller lacks event access", async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await get("eventId=chile2026")).status).toBe(403);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("returns a server error when the user search RPC fails", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "missing RPC" } });
    expect((await get("eventId=chile2026")).status).toBe(500);
  });
});
