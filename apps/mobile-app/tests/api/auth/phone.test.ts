/// <reference types="jest" />

jest.mock(
  "expo/virtual/env",
  () => ({
    __esModule: true,
    env: process.env,
  }),
  { virtual: true },
);

const mockGetSupabaseServerEnv = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn();
const mockResolveIdentity = jest.fn();
const mockSendSms = jest.fn();

// Static import below evaluates these factories before the consts above are
// initialised, so each mock is reached through a lambda that looks it up lazily.
jest.mock("../../../lib/supabase-server", () => ({
  getSupabaseServerEnv: (...args: unknown[]) => mockGetSupabaseServerEnv(...args),
  getSupabaseServerForRequest: (...args: unknown[]) => mockGetSupabaseServerForRequest(...args),
}));

jest.mock("../../../lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveIdentity(...args),
  isResolveIdentityError: (value: { error?: string }) =>
    typeof value?.error === "string",
}));

jest.mock("../../../lib/server/sms-auth", () => {
  const actual = jest.requireActual("../../../lib/server/sms-auth");
  return { ...actual, sendTransactionalSms: (...args: unknown[]) => mockSendSms(...args) };
});

import { GET, OPTIONS, POST } from "../../../app/api/auth/phone+api";

type TableResult = { data?: unknown; error?: unknown };

const CHALLENGE_ID = "0b6f0c52-6d1c-4f0e-9d2e-3a7a1c8b9e10";
const USER_ID = "user-123";

/** Chainable query builder; every terminal (await, maybeSingle) yields the table's configured result. */
const createBuilder = (result: TableResult) => {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const builder: Record<string, jest.Mock> = {};
  for (const name of ["select", "eq", "is", "order", "limit", "insert", "upsert"]) {
    builder[name] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn(async () => resolved);
  builder.then = jest.fn((resolve) => resolve(resolved));
  return builder;
};

interface ClientOptions {
  tables?: Record<string, TableResult>;
  rpc?: TableResult;
  user?: { email?: string } | null;
  userError?: unknown;
}

const setClient = ({ tables = {}, rpc, user = { email: "Ada@Example.com" }, userError = null }: ClientOptions = {}) => {
  const builders: Record<string, ReturnType<typeof createBuilder>> = {};
  const client = {
    from: jest.fn((table: string) => (builders[table] = createBuilder(tables[table] ?? {}))),
    rpc: jest.fn(async () => ({ data: rpc?.data ?? null, error: rpc?.error ?? null })),
    auth: {
      admin: {
        getUserById: jest.fn(async () => ({ data: { user }, error: userError })),
      },
    },
  };
  mockGetSupabaseServerForRequest.mockReturnValue(client);
  return { client, builders };
};

const bearer = { Authorization: "Bearer token-abc" };

const post = (body: unknown, headers: Record<string, string> = bearer) =>
  POST(
    new Request("https://api.test/api/auth/phone", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const get = (headers: Record<string, string> = bearer) =>
  GET(new Request("https://api.test/api/auth/phone", { headers }));

beforeEach(() => {
  mockGetSupabaseServerEnv.mockReset().mockReturnValue({ supabaseServiceKey: "service-role-key" });
  mockGetSupabaseServerForRequest.mockReset();
  mockResolveIdentity.mockReset().mockResolvedValue({ supabaseUserId: USER_ID });
  mockSendSms.mockReset().mockResolvedValue({ success: true });
  setClient();
});

describe("phone authenticator api", () => {
  it("answers CORS preflight", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
  });

  describe("GET", () => {
    it("requires a bearer token", async () => {
      const response = await get({});
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "bearer_required" });
    });

    it("surfaces identity resolution failures", async () => {
      mockResolveIdentity.mockResolvedValue({ error: "invalid_token", status: 401 });
      const response = await get();
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "invalid_token" });
    });

    it("requires a linked Supabase account", async () => {
      mockResolveIdentity.mockResolvedValue({ supabaseUserId: null });
      const response = await get();
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "linked_account_required" });
    });

    it("lists the trusted phones as last4 and verifiedAt", async () => {
      setClient({
        tables: {
          user_phone_authenticators: {
            data: [{ phone_last4: "2233", verified_at: "2026-10-01T00:00:00.000Z" }],
          },
        },
      });
      const response = await get();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        data: { phones: [{ last4: "2233", verifiedAt: "2026-10-01T00:00:00.000Z" }] },
      });
    });

    it("returns an empty list when nothing is enrolled", async () => {
      setClient({ tables: { user_phone_authenticators: { data: null } } });
      const response = await get();
      expect((await response.json()).data.phones).toEqual([]);
    });

    it("reports a 503 when the lookup fails", async () => {
      setClient({ tables: { user_phone_authenticators: { error: { message: "boom" } } } });
      const response = await get();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "phone_authenticator_unavailable" });
    });
  });

  describe("POST request validation", () => {
    it.each([["not json"], ["[]"], ["null"]])("rejects malformed body %s", async (body) => {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_json" });
    });

    it("fails closed without a service key", async () => {
      mockGetSupabaseServerEnv.mockReturnValue({ supabaseServiceKey: "" });
      const response = await post({ action: "enroll-start" });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "auth_service_unavailable" });
    });

    it("rejects unknown actions for an authenticated caller", async () => {
      const response = await post({ action: "nope" });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_action" });
    });

    it("requires a bearer token for enrollment actions", async () => {
      const response = await post({ action: "enroll-start", phone: "+573001112233" }, {});
      expect(response.status).toBe(401);
    });
  });

  describe("registration-verify", () => {
    const body = { action: "registration-verify", email: "Ada@Example.com", challengeId: CHALLENGE_ID, code: "123456" };

    it("does not need a bearer token and consumes the registration challenge", async () => {
      const { client } = setClient({ rpc: { data: { ok: true } } });
      const response = await post(body, {});
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, data: { success: true, next: "email" } });
      expect(client.rpc).toHaveBeenCalledWith(
        "consume_sms_auth_challenge",
        expect.objectContaining({ p_challenge_id: CHALLENGE_ID, p_user_id: null, p_purpose: "registration" }),
      );
    });

    it.each([
      ["a bad email", { email: "nope" }],
      ["a bad challenge id", { challengeId: "x" }],
      ["a short code", { code: "123" }],
    ])("rejects %s", async (_label, override) => {
      const response = await post({ ...body, ...override }, {});
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    });

    it("rejects an expired or wrong code", async () => {
      setClient({ rpc: { data: { ok: false } } });
      const response = await post(body, {});
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_or_expired_code" });
    });
  });

  describe("enroll-start", () => {
    const body = { action: "enroll-start", phone: "+573001112233" };
    const happy = (): ClientOptions => ({
      tables: {
        user_phone_authenticators: { data: null },
        sms_auth_challenges: {},
      },
      rpc: { data: true },
    });

    it("rejects an invalid phone number", async () => {
      const response = await post({ action: "enroll-start", phone: "123" });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_phone" });
    });

    it("requires an account email", async () => {
      setClient({ ...happy(), user: { email: "" } });
      const response = await post(body);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "account_email_required" });
    });

    it("reports a 503 when the binding lookup fails", async () => {
      setClient({ tables: { user_phone_authenticators: { error: { message: "boom" } } } });
      const response = await post(body);
      expect(response.status).toBe(503);
    });

    it("refuses a phone already bound to another account", async () => {
      setClient({ ...happy(), tables: { user_phone_authenticators: { data: { user_id: "someone-else" } } } });
      const response = await post(body);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "phone_unavailable" });
    });

    it("enforces the two trusted phones limit", async () => {
      // The same table answers both queries; a bound row owned by this user passes the
      // ownership check and the two active rows then trip the limit.
      setClient({
        ...happy(),
        tables: { user_phone_authenticators: { data: [{ id: 1, user_id: USER_ID }, { id: 2 }] } },
      });
      const response = await post(body);
      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe("trusted_phone_limit");
    });

    it("reports a 503 when the delivery slot claim errors", async () => {
      setClient({ ...happy(), rpc: { error: { message: "boom" } } });
      const response = await post(body);
      expect(response.status).toBe(503);
    });

    it("rate limits when no delivery slot is available", async () => {
      setClient({ ...happy(), rpc: { data: false } });
      const response = await post(body);
      expect(response.status).toBe(429);
      expect((await response.json()).error).toBe("sms_rate_limited");
      expect(mockSendSms).not.toHaveBeenCalled();
    });

    it("reports a 503 when the challenge cannot be stored", async () => {
      setClient({
        ...happy(),
        tables: { user_phone_authenticators: { data: null }, sms_auth_challenges: { error: { message: "boom" } } },
      });
      const response = await post(body);
      expect(response.status).toBe(503);
      expect(mockSendSms).not.toHaveBeenCalled();
    });

    it("passes the provider failure through", async () => {
      setClient(happy());
      mockSendSms.mockResolvedValue({ success: false, code: "sms_unavailable", message: "down", status: 502 });
      const response = await post(body);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "sms_unavailable", message: "down" });
    });

    it("stores a hashed challenge and texts the code", async () => {
      const { builders } = setClient(happy());
      const response = await post(body);
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.data.challengeId).toMatch(/^[0-9a-f-]{36}$/);

      const inserted = builders.sms_auth_challenges.insert.mock.calls[0][0];
      expect(inserted).toEqual(
        expect.objectContaining({ user_id: USER_ID, purpose: "enrollment", phone_last4: "2233" }),
      );

      const sent = mockSendSms.mock.calls[0][0];
      expect(sent.phone).toBe("+573001112233");
      expect(sent.code).toMatch(/^\d{6}$/);
      // Only the HMAC of the code is persisted, never the code itself.
      expect(inserted.code_hmac).toEqual(expect.any(String));
      expect(inserted.code_hmac).not.toContain(sent.code);
    });
  });

  describe("enroll-verify", () => {
    const body = { action: "enroll-verify", challengeId: CHALLENGE_ID, code: "123456" };
    const verified = { data: { ok: true, phoneLookupHmac: "hmac", phoneLast4: "2233" } };

    it.each([
      ["a bad challenge id", { challengeId: "x" }],
      ["a short code", { code: "12" }],
    ])("rejects %s", async (_label, override) => {
      const response = await post({ ...body, ...override });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    });

    it("requires an account email", async () => {
      setClient({ user: null });
      const response = await post(body);
      expect(response.status).toBe(403);
    });

    it("rejects a wrong or expired code", async () => {
      setClient({ rpc: { data: { ok: false } } });
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_or_expired_code" });
    });

    it("reports a 503 when the binding cannot be saved", async () => {
      setClient({ rpc: verified, tables: { user_phone_authenticators: { error: { message: "boom" } } } });
      const response = await post(body);
      expect(response.status).toBe(503);
    });

    it("binds the verified phone to the account", async () => {
      const { builders, client } = setClient({ rpc: verified });
      const response = await post(body);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, data: { success: true, last4: "2233" } });
      expect(client.rpc).toHaveBeenCalledWith(
        "consume_sms_auth_challenge",
        expect.objectContaining({ p_user_id: USER_ID, p_purpose: "enrollment" }),
      );
      expect(builders.user_phone_authenticators.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: USER_ID, phone_lookup_hmac: "hmac", phone_last4: "2233", revoked_at: null }),
        { onConflict: "user_id,phone_lookup_hmac" },
      );
    });
  });
});
