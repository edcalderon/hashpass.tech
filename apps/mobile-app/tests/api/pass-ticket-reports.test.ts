/// <reference types="jest" />

const mockResolveIdentity = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockAuthorizeAdmin = jest.fn();
const mockRateLimit = jest.fn(() => true);

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === "number",
}));
jest.mock("@/lib/server/global-admin", () => ({
  authorizeGlobalAdmin: (...args: unknown[]) => mockAuthorizeAdmin(...args),
}));
jest.mock("@/lib/bsl/rateLimit", () => ({ rateLimitOk: () => mockRateLimit() }));
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

const userId = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";
const USER_URL = "https://api.hashpass.tech/api/pass-ticket-reports";
const ADMIN_URL = "https://api.hashpass.tech/api/admin/pass-ticket-reports";

const chain = (result: { data: unknown; error?: unknown }) => {
  const c: Record<string, any> = {
    select: jest.fn(() => c),
    eq: jest.fn(() => c),
    in: jest.fn(() => c),
    order: jest.fn(() => c),
    limit: jest.fn(() => c),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve),
  };
  return c;
};
const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

describe("/api/pass-ticket-reports", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockResolveIdentity.mockReset().mockResolvedValue({ supabaseUserId: userId });
    mockRpc.mockReset();
    mockRateLimit.mockReset().mockReturnValue(true);
  });
  afterEach(() => jest.restoreAllMocks());
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = () => require("../../app/api/pass-ticket-reports+api");

  it("requires a linked account and respects the rate limit", async () => {
    mockResolveIdentity.mockResolvedValueOnce({ status: 401, error: "Unauthorized" });
    expect((await load().POST(post(USER_URL, {}))).status).toBe(401);
    mockResolveIdentity.mockResolvedValueOnce({ supabaseUserId: null });
    expect((await load().POST(post(USER_URL, {}))).status).toBe(403);
    mockRateLimit.mockReturnValueOnce(false);
    expect((await load().POST(post(USER_URL, {}))).status).toBe(429);
  });

  it.each([
    ["invalid event", { eventId: "-bad", ticketCode: "ABCD" }],
    ["invalid issuer", { eventId: "colombia2026", issuer: "A B", ticketCode: "ABCD" }],
    ["short code", { eventId: "colombia2026", ticketCode: "AB" }],
    ["unknown reason", { eventId: "colombia2026", ticketCode: "ABCD", reason: "spite" }],
    ["malformed body", "nope"],
  ])("rejects %s", async (_name, body) => {
    expect((await load().POST(post(USER_URL, body))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("files a report for the caller", async () => {
    mockRpc.mockResolvedValueOnce({ data: { id: "r1", status: "open", claim_found: true }, error: null });
    const res = await load().POST(post(USER_URL, {
      eventId: "Colombia2026", ticketCode: " abcd1234 ", details: "x".repeat(2000),
    }));
    expect(res.status).toBe(201);
    const [fn, args] = mockRpc.mock.calls[0];
    expect(fn).toBe("report_external_ticket");
    expect(args).toMatchObject({
      p_reporter_user_id: userId, p_event_id: "colombia2026", p_ticket_code: "ABCD1234",
      p_issuer: "blockchain_summit_latam", p_reason: "impersonation",
    });
    expect(args.p_details).toHaveLength(1000);
  });

  it("identifies a code-less QR by the same digest the claim API derives", async () => {
    mockRpc.mockResolvedValue({ data: { id: "r1" }, error: null });
    await load().POST(post(USER_URL, { eventId: "colombia2026", qrPayload: "opaque ticket payload" }));
    expect(mockRpc.mock.calls[0][1].p_ticket_code).toMatch(/^[0-9A-F]{24}$/);
  });

  it("maps self-reports to 400 and other failures to 503", async () => {
    const body = { eventId: "colombia2026", ticketCode: "abcd" };
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "You cannot report your own ticket claim" } });
    expect((await load().POST(post(USER_URL, body))).status).toBe(400);
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect((await load().POST(post(USER_URL, body))).status).toBe(503);
  });
});

describe("/api/admin/pass-ticket-reports", () => {
  const mockGetUserById = jest.fn();
  const adminSupabase = {
    from: (...a: unknown[]) => mockFrom(...a),
    auth: { admin: { getUserById: (...a: unknown[]) => mockGetUserById(...a) } },
  };
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockGetUserById.mockReset().mockImplementation(async (id: string) => {
      if (id === "bad") throw new Error("auth down");
      return { data: { user: { email: `${id}@example.com` } } };
    });
    mockAuthorizeAdmin.mockReset().mockResolvedValue({ userId: "admin-1", supabase: adminSupabase });
  });
  afterEach(() => jest.restoreAllMocks());
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = () => require("../../app/api/admin/pass-ticket-reports+api");

  it("returns the authorization response for non-admins", async () => {
    mockAuthorizeAdmin.mockResolvedValue({ response: new Response("no", { status: 403 }) });
    expect((await load().GET(new Request(ADMIN_URL))).status).toBe(403);
    expect((await load().POST(post(ADMIN_URL, {}))).status).toBe(403);
  });

  it("lists reports with reporter and claimant emails", async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [
        { id: "r1", claim_id: "c1", reporter_user_id: "rep" },
        { id: "r2", claim_id: null, reporter_user_id: "bad" },
      ] }))
      .mockReturnValueOnce(chain({ data: [{ id: "c1", claimant_user_id: "thief", status: "converted" }] }));
    const body = await (await load().GET(new Request(ADMIN_URL))).json();
    expect(body.data[0]).toMatchObject({
      reporter_email: "rep@example.com", claimant_email: "thief@example.com", claim_status: "converted",
    });
    expect(body.data[1]).toMatchObject({ reporter_email: null, claimant_email: null, claimant_user_id: null });
  });

  it("validates status and reports load failures", async () => {
    expect((await load().GET(new Request(`${ADMIN_URL}?status=weird`))).status).toBe(400);
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: "x" } }));
    expect((await load().GET(new Request(ADMIN_URL))).status).toBe(503);
    mockFrom.mockReturnValueOnce(chain({ data: null }));
    expect(await (await load().GET(new Request(`${ADMIN_URL}?status=confirmed`))).json()).toEqual({ data: [] });
  });

  it("validates review input", async () => {
    expect((await load().POST(post(ADMIN_URL, { reportId: "nope", action: "confirm" }))).status).toBe(400);
    expect((await load().POST(post(ADMIN_URL, { reportId, action: "delete" }))).status).toBe(400);
    expect((await load().POST(post(ADMIN_URL, "nope"))).status).toBe(400);
  });

  it("resolves a report through the service RPC and reports failures", async () => {
    mockRpc.mockResolvedValueOnce({ data: { id: reportId, status: "confirmed" }, error: null });
    const res = await load().POST(post(ADMIN_URL, { reportId, action: "CONFIRM", note: "n".repeat(2000) }));
    expect(await res.json()).toEqual({ data: { id: reportId, status: "confirmed" } });
    const [fn, args] = mockRpc.mock.calls[0];
    expect(fn).toBe("resolve_external_ticket_report");
    expect(args).toMatchObject({ p_report_id: reportId, p_actor_user_id: "admin-1", p_action: "confirm" });
    expect(args.p_note).toHaveLength(1000);
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect((await load().POST(post(ADMIN_URL, { reportId, action: "dismiss" }))).status).toBe(503);
  });
});
