/// <reference types="jest" />

const mockRpc = jest.fn();
const mockResolveNotificationIdentity = jest.fn();
const mockFrom = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn();

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args),
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
    mockGetSupabaseServerForRequest.mockReset();
    mockGetSupabaseServerForRequest.mockImplementation(() => ({
      rpc: (...args: unknown[]) => mockRpc(...args),
      from: (...args: unknown[]) => mockFrom(...args),
    }));
  });

  it("creates a CBWeek general pass for the authenticated user", async () => {
    mockRpc.mockResolvedValue({ data: "cbweek-pass", error: null });
    const response = await post({ action: "create-default", eventId: " CBWeek2026 ", userId: "someone-else" });
    expect(response.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith("create_default_pass", {
      p_user_id: userId, p_pass_type: "general", p_event_id: "cbweek2026",
    });
  });

  it.each([
    ["https://api.hashpass.tech/api/passes", "https://cbweek-dev.hashpass.tech", "core-production"],
    ["https://api-dev.hashpass.tech/api/passes", "https://cbweek2026.hashpass.tech", "bsl-development"],
  ] as const)(
    "uses the API host for the body-selected CBWeek profile (%s)",
    async (url, origin, profileId) => {
      mockRpc.mockResolvedValue({ data: "cbweek-pass", error: null });
      const request = new Request(url, {
        method: "POST",
        headers: { origin },
        body: JSON.stringify({ action: "create-default", eventId: "cbweek2026" }),
      });
      /* eslint-disable-next-line @typescript-eslint/no-require-imports */
      const { POST } = require("../../app/api/passes+api");
      await POST(request);

      expect(mockResolveNotificationIdentity).toHaveBeenCalledWith(request, profileId);
      expect(mockGetSupabaseServerForRequest).toHaveBeenCalledWith(request, profileId);
    },
  );

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

  it("returns the existing pass when another tier already holds the event slot", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "unique_user_event" } });
    const builder: Record<string, jest.Mock> = {};
    for (const name of ["select", "eq", "order", "limit"]) builder[name] = jest.fn(() => builder);
    builder.maybeSingle = jest.fn(async () => ({ data: { id: "vip-pass" }, error: null }));
    mockFrom.mockReturnValue(builder);

    const response = await post({ action: "create-default", eventId: "colombia2026" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { passId: "vip-pass" } });
    expect(mockFrom).toHaveBeenCalledWith("passes");
    expect(builder.eq).toHaveBeenCalledWith("user_id", userId);
  });

  it("still reports unavailable when a duplicate cannot be resolved to a pass", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    const builder: Record<string, jest.Mock> = {};
    for (const name of ["select", "eq", "order", "limit"]) builder[name] = jest.fn(() => builder);
    builder.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
    mockFrom.mockReturnValue(builder);
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    expect((await post({ action: "create-default", eventId: "colombia2026" })).status).toBe(503);
  });
});

describe("/api/passes event wallet", () => {
  let query: Record<string, jest.Mock>;
  let eventQuery: Record<string, jest.Mock>;
  let passRows: Record<string, unknown>[];
  let eventRows: Record<string, unknown>[];
  const get = async (params: string) => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/passes+api");
    return GET(new Request(`https://api.hashpass.tech/api/passes${params}`));
  };

  beforeEach(() => {
    mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: "account-id" });
    mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
    passRows = [];
    eventRows = [];
    const makeQuery = (getRows: () => Record<string, unknown>[]) => {
      const builder: Record<string, jest.Mock> = {};
      for (const method of ["select", "eq", "in", "order"]) {
        builder[method] = jest.fn().mockReturnValue(builder);
      }
      builder.then = jest.fn((resolve) => resolve({ data: getRows(), error: null }));
      return builder;
    };
    query = makeQuery(() => passRows);
    eventQuery = makeQuery(() => eventRows);
    mockFrom.mockReset().mockImplementation((table: string) =>
      table === "passes" ? query : eventQuery,
    );
  });

  it("selects BSL development for an unscoped pass wallet by API host", async () => {
    const request = new Request("https://api-dev.hashpass.tech/api/passes", {
      headers: { origin: "https://cbweek2026.hashpass.tech" },
    });
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/passes+api");

    await GET(request);

    expect(mockResolveNotificationIdentity).toHaveBeenCalledWith(request, "bsl-development");
    expect(mockGetSupabaseServerForRequest).toHaveBeenCalledWith(request, "bsl-development");
  });

  it("fails closed while PostgREST is missing the required expiry function", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "Function is missing from the schema cache" },
    });

    expect((await get("")).status).toBe(503);
    expect(query.then).not.toHaveBeenCalled();
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
    passRows = [
      { id: "new-general", event_id: "cbweek2026", pass_type: "general", status: "active" },
      { id: "paid-pass", event_id: "cbweek2026", pass_type: passType, status: "active", pass_number: 42 },
      { id: "inactive-vip", event_id: "cbweek2026", pass_type: "vip", status: "cancelled" },
    ];
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
    passRows = [
      { id: "first", event_id: "cbweek2026", pass_type: firstType, status: firstStatus },
      { id: "second", event_id: "cbweek2026", pass_type: secondType, status: secondStatus },
    ];
    const response = await get("");
    expect((await response.json()).data).toEqual([
      expect.objectContaining({ pass_id: expectedId }),
    ]);
  });

  it("returns backend event styling and runs the expiry transition before listing passes", async () => {
    passRows = [
      { id: "chile-pass", event_id: "chile2026", pass_type: "general", status: "active" },
    ];
    eventRows = [
      {
        id: "chile2026",
        name: "Blockchain Summit Latam Chile 2026",
        starts_at: "2026-08-05T09:00:00-04:00",
        ends_at: "2026-08-07T23:59:59-04:00",
        timezone: "America/Santiago",
        city: "Santiago",
        country: "Chile",
        metadata: { walletPassStyle: "event", walletPassColor: "#00A9E0" },
      },
    ];

    const response = await get("");
    expect(mockRpc).toHaveBeenCalledWith("expire_ended_event_passes");
    expect(eventQuery.in).toHaveBeenCalledWith("id", ["chile2026"]);
    expect((await response.json()).data).toEqual([
      expect.objectContaining({
        event_name: "Blockchain Summit Latam Chile 2026",
        event_starts_at: "2026-08-05T09:00:00-04:00",
        event_ends_at: "2026-08-07T23:59:59-04:00",
        event_time_zone: "America/Santiago",
        event_location: "Santiago, Chile",
        wallet_pass_style: "event",
        wallet_pass_color: "#00A9E0",
      }),
    ]);
  });
});
