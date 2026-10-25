/// <reference types="jest" />

const mockIdentity = jest.fn();
const mockSupabase = { from: jest.fn() };
const mockRateLimitOk = jest.fn(() => true);

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  isResolveIdentityError: (value: { status?: number }) => typeof value?.status === "number",
  resolveNotificationIdentity: (_request: Request) => mockIdentity(),
}));
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => mockSupabase,
}));
jest.mock("@/lib/bsl/rateLimit", () => ({
  rateLimitOk: (_key: string) => mockRateLimitOk(),
}));

const queryResult = (result: { data: unknown; error: unknown }) => {
  const query: Record<string, jest.Mock> = {};
  query.select = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.order = jest.fn(() => query);
  query.limit = jest.fn(() => query);
  query.maybeSingle = jest.fn(async () => result);
  return query;
};

describe("/api/qr/resolve", () => {
  beforeEach(() => {
    jest.resetModules();
    mockIdentity.mockReset();
    mockSupabase.from.mockReset();
    mockRateLimitOk.mockReset().mockReturnValue(true);
    mockIdentity.mockResolvedValue({
      supabaseUserId: "caller-id",
      registryUserId: "registry-id",
      email: "caller@example.com",
    });
  });

  const post = async (body: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require("../../app/api/qr/resolve+api");
    return POST(new Request("https://api.hashpass.tech/api/qr/resolve", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }));
  };

  const postRaw = async (body: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require("../../app/api/qr/resolve+api");
    return POST(new Request("https://api.hashpass.tech/api/qr/resolve", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    }));
  };

  it("requires an authenticated caller", async () => {
    mockIdentity.mockResolvedValue({ error: "Unauthorized", status: 401 });

    const response = await post({ kind: "pass_id", passId: "pass-1", raw: "pass-1" });

    expect(response.status).toBe(401);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("rate limits QR resolution before authentication or database access", async () => {
    mockRateLimitOk.mockReturnValue(false);

    const response = await post({ kind: "pass_id", passId: "pass-1", raw: "pass-1" });

    expect(response.status).toBe(429);
    expect(mockIdentity).not.toHaveBeenCalled();
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and unsupported payload kinds", async () => {
    await expect((await postRaw("not-json")).status).toBe(400);
    await expect((await post({ kind: "camera", raw: "camera" })).status).toBe(400);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("rejects malformed event identifiers before querying pass data", async () => {
    const response = await post({ kind: "wallet", network: "ethereum", eventId: "../../private" });

    expect(response.status).toBe(400);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns sanitized pass, owner, status, and usage metadata", async () => {
    const pass = {
      id: "pass-1",
      user_id: "user-1",
      event_id: "colombia2026",
      pass_type: "vip",
      status: "active",
      pass_number: "BSL-VIP-0001",
      max_meeting_requests: 10,
      used_meeting_requests: 2,
      max_boost_amount: 100,
      used_boost_amount: 15,
      created_at: "2026-09-30T16:30:13.000Z",
      updated_at: "2026-10-01T16:30:13.000Z",
    };
    mockSupabase.from
      .mockReturnValueOnce(queryResult({ data: pass, error: null }))
      .mockReturnValueOnce(queryResult({
        data: { id: "user-1", full_name: "Ada Lovelace", display_name: null, username: "ada", name: null },
        error: null,
      }));

    const response = await post({ kind: "pass_id", passId: "pass-1", raw: "pass-1" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      valid: true,
      kind: "pass_id",
      message: "HashPass pass is valid",
      eventId: "colombia2026",
        user: { id: "user-1", name: "Ada Lovelace", username: null },
      pass: {
        id: "pass-1",
        number: "BSL-VIP-0001",
        type: "vip",
        status: "active",
        eventId: "colombia2026",
        createdAt: "2026-09-30T16:30:13.000Z",
        updatedAt: "2026-10-01T16:30:13.000Z",
        requests: { used: 2, max: 10 },
        boost: { used: 15, max: 100 },
      },
    });
    expect(JSON.stringify(body)).not.toContain("email");
  });

  it("recognizes wallet/network payloads without querying private pass data", async () => {
    const response = await post({ kind: "wallet", address: "0xabc", network: "ethereum", raw: "wallet" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      valid: true,
      kind: "wallet",
      network: "ethereum",
      address: "0xabc",
    });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns an invalid resolution for an incomplete network payload", async () => {
    const response = await post({ kind: "network", raw: "network" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      kind: "network",
      message: "Network QR is incomplete",
    });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("identifies an HPass user even when the user has no event pass", async () => {
    mockSupabase.from
      .mockReturnValueOnce(queryResult({ data: null, error: null }))
      .mockReturnValueOnce(queryResult({ data: null, error: null }))
      .mockReturnValueOnce(queryResult({
        data: { user_id: "hpass-user-1234", full_name: "Grace Hopper", display_name: null },
        error: null,
      }));

    const response = await post({ kind: "hpass_id", hpassId: "hpass-user-1234", raw: "hpass-user-1234" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      valid: true,
      kind: "hpass_id",
      message: "HashPass user identified",
      user: { id: "hpass-user-1234", name: "Grace Hopper", username: null },
    });
  });

  it("scopes user pass lookups to the requested event before selecting the newest pass", async () => {
    const passQuery = queryResult({
      data: {
        id: "pass-bsl",
        user_id: "user-1",
        event_id: "bsl",
        pass_type: "general",
        status: "active",
        pass_number: "BSL-GENERAL-0001",
        max_meeting_requests: 10,
        used_meeting_requests: 0,
        max_boost_amount: 100,
        used_boost_amount: 0,
        created_at: "2026-10-01T00:00:00.000Z",
        updated_at: "2026-10-01T00:00:00.000Z",
      },
      error: null,
    });
    mockSupabase.from
      .mockReturnValueOnce(queryResult({ data: null, error: null }))
      .mockReturnValueOnce(passQuery)
      .mockReturnValueOnce(queryResult({
        data: { id: "user-1", full_name: "Ada Lovelace", display_name: null },
        error: null,
      }));

    const response = await post({
      kind: "hpass_id",
      hpassId: "user-1",
      eventId: "bsl",
      raw: "hpass://user-1?event=bsl",
    });

    expect(response.status).toBe(200);
    expect(passQuery.eq).toHaveBeenCalledWith("event_id", "bsl");
    await expect(response.json()).resolves.toMatchObject({
      valid: true,
      eventId: "bsl",
      pass: { id: "pass-bsl", eventId: "bsl" },
    });
  });

  it("rejects a pass that is explicitly tied to another event", async () => {
    mockSupabase.from.mockReturnValueOnce(queryResult({
      data: {
        id: "pass-other-event",
        user_id: "user-1",
        event_id: "other-event",
        pass_type: "general",
        status: "active",
        pass_number: "OTHER-0001",
      },
      error: null,
    }));

    const response = await post({ kind: "pass_id", passId: "pass-other-event", eventId: "colombia2026" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      message: "The pass belongs to a different event",
      eventId: "other-event",
    });
  });

  it("returns a not-found response when all pass lookup candidates miss", async () => {
    mockSupabase.from
      .mockReturnValueOnce(queryResult({ data: null, error: null }))
      .mockReturnValueOnce(queryResult({ data: null, error: new Error("not found") }));

    const response = await post({ kind: "pass_id", passId: "missing-pass" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      kind: "pass_id",
    });
  });
});
