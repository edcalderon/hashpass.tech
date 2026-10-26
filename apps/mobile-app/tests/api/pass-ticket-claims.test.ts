/// <reference types="jest" />

const mockResolveIdentity = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockAuthorizeAdmin = jest.fn();

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === "number",
}));
jest.mock("@/lib/server/global-admin", () => ({
  authorizeGlobalAdmin: (...args: unknown[]) => mockAuthorizeAdmin(...args),
}));
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

const userId = "11111111-1111-4111-8111-111111111111";

const chain = (result: { data: unknown; error?: unknown }) => {
  const c: Record<string, any> = {
    select: jest.fn(() => c),
    eq: jest.fn(() => c),
    order: jest.fn(() => c),
    maybeSingle: jest.fn(async () => ({ data: result.data, error: result.error ?? null })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve),
  };
  return c;
};

const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

const USER_URL = "https://api.hashpass.tech/api/pass-ticket-claims";
const ADMIN_URL = "https://api.hashpass.tech/api/admin/pass-ticket-claims";

describe("/api/pass-ticket-claims", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockResolveIdentity.mockReset().mockResolvedValue({ supabaseUserId: userId });
    mockFrom.mockReset();
    mockRpc.mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = () => require("../../app/api/pass-ticket-claims+api");

  it("passes through identity errors and requires a linked account", async () => {
    mockResolveIdentity.mockResolvedValueOnce({ status: 401, error: "Unauthorized" });
    expect((await load().GET(new Request(USER_URL))).status).toBe(401);
    mockResolveIdentity.mockResolvedValueOnce({ supabaseUserId: null });
    expect((await load().GET(new Request(USER_URL))).status).toBe(403);
    mockResolveIdentity.mockResolvedValueOnce({ status: 401, error: "Unauthorized" });
    expect((await load().POST(post(USER_URL, {}))).status).toBe(401);
    mockResolveIdentity.mockResolvedValueOnce({ supabaseUserId: null });
    expect((await load().POST(post(USER_URL, {}))).status).toBe(403);
  });

  it("lists only the caller's claims", async () => {
    const q = chain({ data: [{ id: "c1" }] });
    mockFrom.mockReturnValueOnce(q);
    const res = await load().GET(new Request(USER_URL));
    expect(await res.json()).toEqual({ data: [{ id: "c1" }] });
    expect(q.eq).toHaveBeenCalledWith("claimant_user_id", userId);
  });

  it("returns an empty list for null data and 503 on error", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null }));
    expect(await (await load().GET(new Request(USER_URL))).json()).toEqual({ data: [] });
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: "x" } }));
    expect((await load().GET(new Request(USER_URL))).status).toBe(503);
  });

  it.each([
    ["invalid event", { eventId: "-bad", ticketCode: "ABCD" }],
    ["short code", { eventId: "colombia2026", ticketCode: "AB" }],
    ["unknown pass type", { eventId: "colombia2026", ticketCode: "ABCD", requestedPassType: "gold" }],
    ["malformed body", "nope"],
  ])("rejects %s", async (_name, body) => {
    expect((await load().POST(post(USER_URL, body))).status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("submits a manual claim with a hashed digest", async () => {
    mockRpc.mockResolvedValueOnce({ data: { id: "c1" }, error: null });
    const res = await load().POST(post(USER_URL, { eventId: "Colombia2026", ticketCode: " abcd1234 " }));
    expect(await res.json()).toEqual({ data: { id: "c1" } });
    const [fn, args] = mockRpc.mock.calls[0];
    expect(fn).toBe("submit_external_ticket_claim");
    expect(args).toMatchObject({
      p_user_id: userId,
      p_event_id: "colombia2026",
      p_ticket_code: "ABCD1234",
      p_issuer: "blockchain_summit_latam",
      p_requested_pass_type: "general",
      p_source_qr_payload: { format: "manual_ticket_code" },
      p_source_ticket_metadata: {},
    });
    expect(args.p_source_qr_digest).toMatch(/^manual:[0-9a-f]{64}$/);
  });

  it("scopes manual ticket fingerprints to the issuer and event", async () => {
    mockRpc.mockResolvedValue({ data: { id: "c" }, error: null });
    await load().POST(post(USER_URL, {
      eventId: "colombia2026", issuer: "issuer-a", ticketCode: "SAME-CODE",
    }));
    await load().POST(post(USER_URL, {
      eventId: "chile2026", issuer: "issuer-b", ticketCode: "SAME-CODE",
    }));

    expect(mockRpc.mock.calls[0][1].p_source_qr_digest).toMatch(/^manual:[0-9a-f]{64}$/);
    expect(mockRpc.mock.calls[1][1].p_source_qr_digest)
      .not.toBe(mockRpc.mock.calls[0][1].p_source_qr_digest);
  });

  it("stores a truncated QR payload and metadata when scanned", async () => {
    mockRpc.mockResolvedValueOnce({ data: { id: "c2" }, error: null });
    await load().POST(post(USER_URL, {
      eventId: "colombia2026",
      ticketCode: "abcd",
      qrPayload: "x".repeat(5000),
      ticketMetadata: { seat: "A1" },
      requestedPassType: "VIP",
    }));
    const args = mockRpc.mock.calls[0][1];
    expect(args.p_source_qr_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_source_qr_payload.raw).toHaveLength(4096);
    expect(args.p_source_ticket_metadata).toEqual({ seat: "A1" });
    expect(args.p_requested_pass_type).toBe("vip");
  });

  it("maps duplicate claims to 409 and other failures to 503", async () => {
    const body = { eventId: "colombia2026", ticketCode: "abcd" };
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "dup" } });
    expect((await load().POST(post(USER_URL, body))).status).toBe(409);
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "ticket has Already been claimed" } });
    expect((await load().POST(post(USER_URL, body))).status).toBe(409);
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect((await load().POST(post(USER_URL, body))).status).toBe(503);
  });
});

describe("/api/admin/pass-ticket-claims", () => {
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
    mockGetUserById.mockReset().mockResolvedValue({ data: { user: { email: "claimant@example.com" } } });
    mockAuthorizeAdmin.mockReset().mockResolvedValue({ userId: "admin-1", supabase: adminSupabase });
  });
  afterEach(() => jest.restoreAllMocks());

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = () => require("../../app/api/admin/pass-ticket-claims+api");

  it("returns the authorization response for non-admins", async () => {
    mockAuthorizeAdmin.mockResolvedValue({ response: new Response("no", { status: 403 }) });
    expect((await load().GET(new Request(ADMIN_URL))).status).toBe(403);
    expect((await load().POST(post(ADMIN_URL, {}))).status).toBe(403);
  });

  it("filters claims by status and event", async () => {
    const q = chain({ data: [{ id: "c1", claimant_user_id: "u1" }] });
    mockFrom.mockReturnValueOnce(q);
    const res = await load().GET(new Request(`${ADMIN_URL}?status=pending&eventId=e1`));
    expect(await res.json()).toEqual({
      data: [{ id: "c1", claimant_user_id: "u1", claimant_email: "claimant@example.com" }],
    });
    expect(q.eq).toHaveBeenCalledWith("status", "pending");
    expect(q.eq).toHaveBeenCalledWith("event_id", "e1");
  });

  it("looks each claimant up once and keeps a claim whose email lookup fails", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [
      { id: "c1", claimant_user_id: "u1" },
      { id: "c2", claimant_user_id: "u1" },
      { id: "c3", claimant_user_id: "u2" },
      { id: "c4", claimant_user_id: "u3" },
    ] }));
    mockGetUserById.mockImplementation(async (id: string) => {
      if (id === "u2") throw new Error("auth down");
      if (id === "u3") return { data: { user: null } };
      return { data: { user: { email: "claimant@example.com" } } };
    });
    const body = await (await load().GET(new Request(ADMIN_URL))).json();
    expect(body.data.map((c: any) => c.claimant_email)).toEqual(["claimant@example.com", "claimant@example.com", null, null]);
    expect(mockGetUserById).toHaveBeenCalledTimes(3);
  });

  it("lists unfiltered, tolerating null data, and reports errors", async () => {
    const q = chain({ data: null });
    mockFrom.mockReturnValueOnce(q);
    expect(await (await load().GET(new Request(ADMIN_URL))).json()).toEqual({ data: [] });
    expect(q.eq).not.toHaveBeenCalled();
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: "x" } }));
    expect((await load().GET(new Request(ADMIN_URL))).status).toBe(503);
  });

  it("validates review input", async () => {
    expect((await load().POST(post(ADMIN_URL, { claimId: "c", action: "approve", passType: "gold" }))).status).toBe(400);
    expect((await load().POST(post(ADMIN_URL, { action: "approve" }))).status).toBe(400);
    expect((await load().POST(post(ADMIN_URL, { claimId: "c", action: "delete" }))).status).toBe(400);
    expect((await load().POST(post(ADMIN_URL, "nope"))).status).toBe(400);
  });

  it("requires a QR payload to inspect", async () => {
    expect((await load().POST(post(ADMIN_URL, { action: "inspect" }))).status).toBe(400);
  });

  it("reports inspection lookup failures", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: "x" } }));
    expect((await load().POST(post(ADMIN_URL, { action: "inspect", qrPayload: "qr" }))).status).toBe(503);
  });

  it("inspects unregistered and registered tickets", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null }));
    let body = await (await load().POST(post(ADMIN_URL, { action: "inspect", qrPayload: "qr" }))).json();
    expect(body.data).toMatchObject({ valid: false, status: "unregistered" });

    for (const [status, valid, message] of [
      ["pending", true, /ready for review/],
      ["validated", true, /ready for review/],
      ["converted", false, /already been converted/],
      ["rejected", false, /was rejected/],
    ] as const) {
      mockFrom.mockReturnValueOnce(chain({ data: { id: "c", status } }));
      body = await (await load().POST(post(ADMIN_URL, { action: "inspect", qrPayload: "qr" }))).json();
      expect(body.data.valid).toBe(valid);
      expect(body.data.message).toMatch(message);
      expect(body.data.claim.status).toBe(status);
    }
  });

  it("reviews a claim through the service RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { status: "converted" }, error: null });
    mockAuthorizeAdmin.mockResolvedValue({ userId: "admin-1", supabase: adminSupabase });
    // The handler builds its own client for RPCs.
    mockRpc.mockImplementation(rpc);
    const res = await load().POST(post(ADMIN_URL, {
      claimId: "c1", action: "APPROVE", passType: "VIP", note: "n".repeat(2000),
    }));
    expect(await res.json()).toEqual({ data: { status: "converted" } });
    const [fn, args] = mockRpc.mock.calls[0];
    expect(fn).toBe("review_external_ticket_claim");
    expect(args).toMatchObject({ p_claim_id: "c1", p_actor_user_id: "admin-1", p_action: "approve", p_pass_type: "vip" });
    expect(args.p_note).toHaveLength(1000);
  });

  it("reports review failures", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect((await load().POST(post(ADMIN_URL, { claimId: "c1", action: "reject" }))).status).toBe(503);
  });
});
