/// <reference types="jest" />

const mockRpc = jest.fn();
const mockResolveNotificationIdentity = jest.fn();

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  isResolveIdentityError: (value: unknown) =>
    Boolean(value && typeof value === "object" && "response" in value),
  resolveNotificationIdentity: (...args: unknown[]) =>
    mockResolveNotificationIdentity(...args),
}));

describe("/api/passes self-service provisioning", () => {
  const userId = "7f60f5d2-5948-4df1-9670-2f9177cf2fe4";

  const post = async (body: Record<string, unknown>) => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { POST } = require("../../app/api/passes+api");
    return POST(
      new Request("https://api.hashpass.tech/api/passes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  };

  beforeEach(() => {
    jest.resetModules();
    mockRpc.mockReset();
    mockResolveNotificationIdentity.mockReset();
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: userId });
  });

  it("rejects paid tiers before calling the service-role RPC", async () => {
    const response = await post({
      action: "create-default",
      passType: "vip",
      eventId: "colombia2026",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Self-service pass creation only supports general passes",
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("always calls the backend RPC with the general tier", async () => {
    mockRpc.mockResolvedValueOnce({ data: "pass-general", error: null });

    const response = await post({
      action: "create-default",
      passType: "general",
      eventId: "colombia2026",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { passId: "pass-general" } });
    expect(mockRpc).toHaveBeenCalledWith("create_default_pass", {
      p_user_id: userId,
      p_pass_type: "general",
      p_event_id: "colombia2026",
    });
  });
});
