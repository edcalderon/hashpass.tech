/// <reference types="jest" />

const mockResolveIdentity = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === "number",
}));
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

const userId = "11111111-1111-4111-8111-111111111111";
const token = "a".repeat(43);

const query = (result: { data: unknown; error?: unknown }) => {
  const chain: Record<string, any> = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    maybeSingle: jest.fn(async () => ({ data: result.data, error: result.error ?? null })),
    single: jest.fn(async () => ({ data: result.data, error: result.error ?? null })),
  };
  return chain;
};

const post = (body: unknown) =>
  new Request("https://api.hashpass.tech/api/pass-shares", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (t?: string) =>
  new Request(`https://api.hashpass.tech/api/pass-shares${t === undefined ? "" : `?token=${t}`}`);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = () => require("../../app/api/pass-shares+api");

describe("/api/pass-shares", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockResolveIdentity.mockReset().mockResolvedValue({ supabaseUserId: userId });
    mockFrom.mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  describe("POST", () => {
    it("passes through identity errors", async () => {
      mockResolveIdentity.mockResolvedValue({ status: 401, error: "Unauthorized" });
      const res = await load().POST(post({}));
      expect(res.status).toBe(401);
    });

    it("requires a linked Supabase account", async () => {
      mockResolveIdentity.mockResolvedValue({ supabaseUserId: null });
      expect((await load().POST(post({}))).status).toBe(409);
    });

    it.each([
      ["malformed body", "not json"],
      ["bad pass id", { passId: "bad id!", eventId: "e" }],
      ["missing event", { passId: "p1" }],
      ["overlong event", { passId: "p1", eventId: "e".repeat(101) }],
    ])("rejects %s", async (_name, body) => {
      expect((await load().POST(post(body))).status).toBe(400);
    });

    it("returns 503 when the pass lookup fails", async () => {
      mockFrom.mockReturnValueOnce(query({ data: null, error: { message: "boom" } }));
      expect((await load().POST(post({ passId: "p1", eventId: "e" }))).status).toBe(503);
    });

    it("requires an active pass owned by the caller", async () => {
      mockFrom.mockReturnValueOnce(query({ data: null }));
      expect((await load().POST(post({ passId: "p1", eventId: "e" }))).status).toBe(403);
      mockFrom.mockReturnValueOnce(query({ data: { id: "p1", event_id: "e", status: "revoked" } }));
      expect((await load().POST(post({ passId: "p1", eventId: "e" }))).status).toBe(403);
    });

    it("rejects a pass from another event", async () => {
      mockFrom.mockReturnValueOnce(query({ data: { id: "p1", event_id: "other", status: "active" } }));
      expect((await load().POST(post({ passId: "p1", eventId: "e" }))).status).toBe(409);
    });

    it("returns 503 when the share cannot be created", async () => {
      mockFrom
        .mockReturnValueOnce(query({ data: { id: "p1", event_id: "e", status: "active" } }))
        .mockReturnValueOnce(query({ data: null, error: { message: "nope" } }));
      expect((await load().POST(post({ passId: "p1", eventId: "e" }))).status).toBe(503);
    });

    it("stores only a token hash and returns the share link", async () => {
      const insertQuery = query({ data: { id: "share-1", expires_at: "2026-11-01T00:00:00Z" } });
      mockFrom
        .mockReturnValueOnce(query({ data: { id: "p1", event_id: "e", status: "active" } }))
        .mockReturnValueOnce(insertQuery);
      const res = await load().POST(post({ passId: "p1", eventId: "e" }));
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.data.url).toMatch(/^https:\/\/hpass\.id\/p\/[A-Za-z0-9_-]{43}$/);
      const inserted = insertQuery.insert.mock.calls[0][0];
      expect(inserted.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(body.data.url).not.toContain(inserted.token_hash);
      expect(body.data.expiresAt).toBe("2026-11-01T00:00:00Z");
    });
  });

  describe("GET", () => {
    it("rejects a malformed token", async () => {
      expect((await load().GET(get("short"))).status).toBe(400);
      expect((await load().GET(get())).status).toBe(400);
    });

    it("returns 503 when the share lookup fails", async () => {
      mockFrom.mockReturnValueOnce(query({ data: null, error: { message: "x" } }));
      expect((await load().GET(get(token))).status).toBe(503);
    });

    it.each([
      ["unknown", null],
      ["revoked", { pass_id: "p1", event_id: "e", revoked_at: "2026-01-01", expires_at: null }],
      ["expired", { pass_id: "p1", event_id: "e", revoked_at: null, expires_at: "2000-01-01T00:00:00Z" }],
    ])("hides a %s share", async (_name, share) => {
      mockFrom.mockReturnValueOnce(query({ data: share }));
      expect((await load().GET(get(token))).status).toBe(404);
    });

    it("returns 503 when the pass lookup fails", async () => {
      mockFrom
        .mockReturnValueOnce(query({ data: { pass_id: "p1", event_id: "e", revoked_at: null, expires_at: null } }))
        .mockReturnValueOnce(query({ data: null, error: { message: "x" } }));
      expect((await load().GET(get(token))).status).toBe(503);
    });

    it("hides an inactive pass", async () => {
      mockFrom
        .mockReturnValueOnce(query({ data: { pass_id: "p1", event_id: "e", revoked_at: null, expires_at: null } }))
        .mockReturnValueOnce(query({ data: { event_id: "e", pass_type: "vip", status: "revoked" } }));
      expect((await load().GET(get(token))).status).toBe(404);
    });

    it("exposes only public pass details", async () => {
      mockFrom
        .mockReturnValueOnce(query({ data: { pass_id: "p1", event_id: "e", revoked_at: null, expires_at: null } }))
        .mockReturnValueOnce(query({ data: { event_id: "e", pass_type: "vip", status: "active" } }));
      const res = await load().GET(get(token));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ eventId: "e", passType: "vip", status: "active" });
    });
  });
});
