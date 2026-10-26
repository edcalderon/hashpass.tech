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
const BASE = "https://api.hashpass.tech/api/qr";

const chain = (result: { data: unknown; error?: unknown }) => {
  const c: Record<string, any> = {
    select: jest.fn(() => c),
    eq: jest.fn(() => c),
    order: jest.fn(() => c),
    insert: jest.fn(() => c),
    maybeSingle: jest.fn(async () => ({ data: result.data, error: result.error ?? null })),
    single: jest.fn(async () => ({ data: result.data, error: result.error ?? null })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve),
  };
  return c;
};
const post = (path: string, body: unknown) =>
  new Request(`${BASE}/${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const forbidden = () => ({ response: new Response("no", { status: 403 }) });

beforeEach(() => {
  jest.resetModules();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  mockResolveIdentity.mockReset().mockResolvedValue({ supabaseUserId: userId });
  mockAuthorizeAdmin.mockReset().mockResolvedValue(forbidden());
  mockFrom.mockReset();
  mockRpc.mockReset();
});
afterEach(() => jest.restoreAllMocks());

describe("GET /api/qr/lookup", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const GET = (qs: string) => require("../../app/api/qr/lookup+api").GET(new Request(`${BASE}/lookup${qs}`));

  it("requires a linked identity", async () => {
    mockResolveIdentity.mockResolvedValueOnce({ status: 401, error: "x" });
    expect((await GET("?id=1")).status).toBe(401);
    mockResolveIdentity.mockResolvedValueOnce({ supabaseUserId: null });
    expect((await GET("?id=1")).status).toBe(403);
  });

  it("requires a scope", async () => {
    expect((await GET("")).status).toBe(400);
  });

  it("returns an owned QR by id or token", async () => {
    const byId = chain({ data: { id: "q", user_id: userId } });
    mockFrom.mockReturnValueOnce(byId);
    expect((await GET("?id=q")).status).toBe(200);
    expect(byId.eq).toHaveBeenCalledWith("id", "q");
    const byToken = chain({ data: { id: "q", user_id: userId } });
    mockFrom.mockReturnValueOnce(byToken);
    expect((await GET("?token=t")).status).toBe(200);
    expect(byToken.eq).toHaveBeenCalledWith("token", "t");
    expect(mockAuthorizeAdmin).not.toHaveBeenCalled();
  });

  it("maps lookup failures and missing codes", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: "x" } }));
    expect((await GET("?id=q")).status).toBe(503);
    mockFrom.mockReturnValueOnce(chain({ data: null }));
    expect((await GET("?id=q")).status).toBe(404);
  });

  it("denies another user's QR unless the caller is an admin", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { id: "q", user_id: "someone-else" } }));
    expect((await GET("?id=q")).status).toBe(403);
    mockAuthorizeAdmin.mockResolvedValue({ userId: "admin" });
    mockFrom.mockReturnValueOnce(chain({ data: { id: "q", user_id: "someone-else" } }));
    expect((await GET("?id=q")).status).toBe(200);
  });

  it("lists only the caller's QR codes, optionally per pass", async () => {
    const q = chain({ data: [{ id: "q" }] });
    mockFrom.mockReturnValueOnce(q);
    expect(await (await GET("?passId=p1")).json()).toEqual({ data: [{ id: "q" }] });
    expect(q.eq).toHaveBeenCalledWith("user_id", userId);
    expect(q.eq).toHaveBeenCalledWith("pass_id", "p1");
    const owner = chain({ data: null });
    mockFrom.mockReturnValueOnce(owner);
    expect(await (await GET("?owner=true")).json()).toEqual({ data: [] });
    expect(owner.eq).not.toHaveBeenCalledWith("pass_id", expect.anything());
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: "x" } }));
    expect((await GET("?owner=true")).status).toBe(503);
  });
});

describe("POST /api/qr/pass", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const POST = (body: unknown) => require("../../app/api/qr/pass+api").POST(post("pass", body));
  const activePass = (owner = userId) => chain({ data: { id: "p1", user_id: owner, status: "active" } });

  it("requires a linked identity and a pass id", async () => {
    mockResolveIdentity.mockResolvedValueOnce({ status: 401, error: "x" });
    expect((await POST({})).status).toBe(401);
    mockResolveIdentity.mockResolvedValueOnce({ supabaseUserId: null });
    expect((await POST({})).status).toBe(403);
    expect((await POST({})).status).toBe(400);
    expect((await POST("nope")).status).toBe(400);
  });

  it("rejects missing or inactive passes and lookup failures", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: "x" } }));
    expect((await POST({ passId: "p1" })).status).toBe(503);
    mockFrom.mockReturnValueOnce(chain({ data: null }));
    expect((await POST({ passId: "p1" })).status).toBe(403);
    mockFrom.mockReturnValueOnce(chain({ data: { id: "p1", user_id: userId, status: "revoked" } }));
    expect((await POST({ passId: "p1" })).status).toBe(403);
  });

  it("blocks a non-owner who is not an admin, allows an admin", async () => {
    mockFrom.mockReturnValueOnce(activePass("other"));
    expect((await POST({ passId: "p1" })).status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
    mockAuthorizeAdmin.mockResolvedValue({ userId: "admin" });
    mockFrom.mockReturnValueOnce(activePass("other")).mockReturnValueOnce(chain({ data: { id: "qr" } }));
    mockRpc.mockResolvedValueOnce({ data: "qr", error: null });
    expect((await POST({ passId: "p1" })).status).toBe(200);
  });

  it("generates a QR with clamped limits and returns it", async () => {
    mockFrom.mockReturnValueOnce(activePass()).mockReturnValueOnce(chain({ data: { id: "qr", token: "t" } }));
    mockRpc.mockResolvedValueOnce({ data: "qr", error: null });
    const res = await POST({ passId: "p1", expiresInMinutes: 99999, maxUses: 0 });
    expect(await res.json()).toEqual({ data: { id: "qr", token: "t" } });
    expect(mockRpc).toHaveBeenCalledWith("generate_pass_qr", {
      p_pass_id: "p1", p_expires_in_minutes: 1440, p_max_uses: 1,
    });
  });

  it("uses defaults for non-numeric limits and surfaces generation failures", async () => {
    mockFrom.mockReturnValueOnce(activePass());
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect((await POST({ passId: "p1", expiresInMinutes: "abc", maxUses: "x" })).status).toBe(503);
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_expires_in_minutes: 30, p_max_uses: 1 });
  });

  it("reports a QR that was created but cannot be loaded", async () => {
    mockFrom.mockReturnValueOnce(activePass()).mockReturnValueOnce(chain({ data: null, error: { message: "x" } }));
    mockRpc.mockResolvedValueOnce({ data: "qr", error: null });
    expect((await POST({ passId: "p1" })).status).toBe(503);
  });
});

describe("POST /api/qr/validate", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const POST = (body: unknown) => require("../../app/api/qr/validate+api").POST(post("validate", body));
  beforeEach(() => mockAuthorizeAdmin.mockResolvedValue({ userId: "admin" }));

  it("is admin-only", async () => {
    mockAuthorizeAdmin.mockResolvedValue(forbidden());
    expect((await POST({ token: "t" })).status).toBe(403);
  });

  it("requires a token", async () => {
    expect((await POST({})).status).toBe(400);
    expect((await POST("nope")).status).toBe(400);
  });

  it("consumes through the atomic RPC by default", async () => {
    mockRpc.mockResolvedValueOnce({ data: { valid: true }, error: null });
    const res = await POST({ token: " t ", scannerDeviceId: " dev " });
    expect(await res.json()).toEqual({ data: { valid: true } });
    expect(mockRpc).toHaveBeenCalledWith("validate_and_use_qr", {
      p_token: "t", p_scanner_user_id: "admin", p_scanner_device_id: "dev",
    });
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await POST({ token: "t" });
    expect(mockRpc.mock.calls[1][1].p_scanner_device_id).toBeNull();
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect((await POST({ token: "t" })).status).toBe(503);
  });

  describe("preview (consume=false)", () => {
    const preview = async (qr: Record<string, unknown> | null, error?: unknown) => {
      mockFrom.mockReturnValueOnce(chain({ data: qr, error }));
      const res = await POST({ token: "t", consume: false });
      return { status: res.status, body: await res.json() };
    };
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();

    it("never mutates and reports lookup errors / unknown tokens", async () => {
      expect((await preview(null, { message: "x" })).status).toBe(503);
      expect((await preview(null)).body.data).toMatchObject({ valid: false, status: "invalid" });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("accepts an active, unexpired, unused QR", async () => {
      const { body } = await preview({ status: "active", expires_at: future, usage_count: 0, max_uses: 1, qr_data: { a: 1 } });
      expect(body.data).toMatchObject({ valid: true, status: "valid", message: "QR code is valid", qr_data: { a: 1 } });
    });

    it("accepts a QR with no expiry", async () => {
      expect((await preview({ status: "active", expires_at: null, usage_count: 0, max_uses: 1 })).body.data.valid).toBe(true);
    });

    it("classifies expired, exhausted, used and other statuses", async () => {
      expect((await preview({ status: "active", expires_at: past, usage_count: 0, max_uses: 1 })).body.data)
        .toMatchObject({ valid: false, status: "expired" });
      expect((await preview({ status: "active", expires_at: future, usage_count: 1, max_uses: 1 })).body.data)
        .toMatchObject({ valid: false, status: "already_used" });
      expect((await preview({ status: "used", expires_at: future, usage_count: 0, max_uses: 5 })).body.data)
        .toMatchObject({ valid: false, status: "already_used" });
      expect((await preview({ status: "revoked", expires_at: future, usage_count: 0, max_uses: 1 })).body.data)
        .toMatchObject({ valid: false, status: "revoked", message: "QR code is revoked" });
    });
  });
});

describe("POST /api/qr/wallet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const POST = (body: unknown) => require("../../app/api/qr/wallet+api").POST(post("wallet", body));

  it("requires a linked identity and a wallet address", async () => {
    mockResolveIdentity.mockResolvedValueOnce({ status: 401, error: "x" });
    expect((await POST({})).status).toBe(401);
    mockResolveIdentity.mockResolvedValueOnce({ supabaseUserId: null });
    expect((await POST({})).status).toBe(403);
    expect((await POST({})).status).toBe(400);
    expect((await POST("nope")).status).toBe(400);
  });

  it("creates a server-owned wallet QR with clamped limits", async () => {
    const q = chain({ data: { id: "w", token: "QR-X", qr_data: {} } });
    mockFrom.mockReturnValueOnce(q);
    const res = await POST({ walletAddress: " 0xabc ", amount: 5, currency: "usdc", expiresInMinutes: 99999, maxUses: 999 });
    expect(res.status).toBe(200);
    const row = q.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      qr_type: "wallet_transfer", user_id: userId, associated_entity_id: "0xabc", max_uses: 25,
    });
    expect(row.token).toMatch(/^QR-[0-9A-F]{40}$/);
    expect(row.qr_data).toMatchObject({ user_id: userId, wallet_address: "0xabc", amount: 5, currency: "USDC" });
    expect(new Date(row.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(1440 * 60_000);
  });

  it("defaults amount, currency and limits", async () => {
    const q = chain({ data: { id: "w" } });
    mockFrom.mockReturnValueOnce(q);
    await POST({ walletAddress: "0xabc", amount: "not-a-number" });
    const row = q.insert.mock.calls[0][0];
    expect(row.qr_data.amount).toBeNull();
    expect(row.qr_data.currency).toBe("VOI");
    expect(row.max_uses).toBe(1);
    mockFrom.mockReturnValueOnce(chain({ data: { id: "w" } }));
    await POST({ walletAddress: "0xabc" });
  });

  it("reports insert failures", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: "x" } }));
    expect((await POST({ walletAddress: "0xabc" })).status).toBe(503);
  });
});
