/// <reference types="jest" />

const mockAuthenticateRequest = jest.fn();
const mockRpc = jest.fn();
const mockResolveNotificationIdentity = jest.fn();

jest.mock("@hashpass/auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: jest.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}));
jest.mock("@/lib/bsl/rateLimit", () => ({ rateLimitOk: () => true }));
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
    mockAuthenticateRequest.mockResolvedValue({
      user: { id: actorId },
      error: null,
    });
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: actorId,
    });
  });

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
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/admin/users+api");
    const response = await GET(
      new Request(
        "https://api.hashpass.tech/api/admin/users?eventId=chile2026&q=ana&limit=25",
      ),
    );
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenLastCalledWith("admin_search_active_users", {
      p_actor_user_id: actorId,
      p_event_id: "chile2026",
      p_query: "ana",
      p_limit: 25,
      p_cursor: null,
    });
  });
});
