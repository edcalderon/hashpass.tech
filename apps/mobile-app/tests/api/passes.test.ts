/// <reference types="jest" />

const mockRpc = jest.fn();
const mockResolveNotificationIdentity = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  isResolveIdentityError: (value: unknown) =>
    Boolean(value && typeof value === "object" && "status" in value),
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
    mockFrom.mockReset();
    mockResolveNotificationIdentity.mockReset();
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: userId });
  });

  it("creates a CBWeek general pass for the authenticated user", async () => {
    mockRpc.mockResolvedValue({ data: "cbweek-pass", error: null });
    const response = await post({ action: "create-default", eventId: " CBWeek2026 ", userId: "someone-else" });
    expect(response.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith("create_default_pass", {
      p_user_id: userId, p_pass_type: "general", p_event_id: "cbweek2026",
    });
  });

  it.each(["business", "vip"])("does not allow a CBWeek user to self-issue %s", async (passType) => {
    const response = await post({ action: "create-default", eventId: "cbweek2026", passType });
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mockResolveNotificationIdentity.mockResolvedValue({ error: "Unauthorized", status: 401 });
    expect((await post({ action: "create-default", eventId: "cbweek2026" })).status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
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

describe("/api/passes event wallet", () => {
  let query: Record<string, jest.Mock>;
  const get = async (params: string) => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/passes+api");
    return GET(new Request(`https://api.hashpass.tech/api/passes${params}`));
  };

  beforeEach(() => {
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: "account-id" });
    mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
    query = {};
    for (const method of ["select", "eq", "in", "order"]) query[method] = jest.fn().mockReturnValue(query);
    query.then = jest.fn((resolve) => resolve({ data: [], error: null }));
    mockFrom.mockReset().mockReturnValue(query);
  });

  it.each(["?eventId=cbweek2026", "?eventIds=cbweek2026,colombia2026"])("loads CBWeek with %s", async (params) => {
    expect((await get(params)).status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("user_id", "account-id");
    expect(query.eq).toHaveBeenCalledWith("status", "active");
    if (params.startsWith("?eventId=")) expect(query.eq).toHaveBeenCalledWith("event_id", "cbweek2026");
    else expect(query.in).toHaveBeenCalledWith("event_id", ["cbweek2026", "colombia2026"]);
  });

  it.each(["?eventId=unknown", "?eventIds=unknown", "?eventIds=cbweek2026,unknown", "?eventIds=", "?eventIds=cbweek2026,"])("rejects invalid filters: %s", async (params) => {
    expect((await get(params)).status).toBe(400);
    expect(query.then).not.toHaveBeenCalled();
  });

  it.each(["business", "vip"])("selects an active %s over a newer general pass", async (passType) => {
    query.then.mockImplementation((resolve) => resolve({ data: [
      { id: "new-general", event_id: "cbweek2026", pass_type: "general", status: "active" },
      { id: "paid-pass", event_id: "cbweek2026", pass_type: passType, status: "active", pass_number: 42 },
      { id: "inactive-vip", event_id: "cbweek2026", pass_type: "vip", status: "cancelled" },
    ], error: null }));
    const response = await get("?eventId=cbweek2026");
    expect((await response.json()).data).toEqual([
      expect.objectContaining({ pass_id: "paid-pass", pass_type: passType, pass_number: "42" }),
    ]);
  });

  it.each([
    ["vip", "business", "active", "active", "first"],
    ["business", "general", "active", "active", "first"],
    ["general", "general", "active", "active", "first"],
    ["vip", "general", "cancelled", "active", "second"],
    ["business", "vip", "active", "active", "second"],
  ])("compares %s and %s passes (%s, %s)", async (firstType, secondType, firstStatus, secondStatus, expectedId) => {
    query.then.mockImplementation((resolve) => resolve({ data: [
      { id: "first", event_id: "cbweek2026", pass_type: firstType, status: firstStatus },
      { id: "second", event_id: "cbweek2026", pass_type: secondType, status: secondStatus },
    ], error: null }));
    const response = await get("");
    expect((await response.json()).data).toEqual([
      expect.objectContaining({ pass_id: expectedId }),
    ]);
  });
});
