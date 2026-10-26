/// <reference types="jest" />

const mockResolveIdentity = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockSendEmail = jest.fn();

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === "number",
}));
jest.mock("@/lib/email", () => ({
  sendCriticalNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

const senderId = "11111111-1111-4111-8111-111111111111";
const recipientId = "22222222-2222-4222-8222-222222222222";
const passId = "33333333-3333-4333-8333-333333333333";
const token = "t".repeat(43);

const chain = (result: { data?: unknown; error?: unknown }) => {
  const c: Record<string, any> = {
    select: jest.fn(() => c),
    eq: jest.fn(() => c),
    lt: jest.fn(() => c),
    or: jest.fn(() => c),
    update: jest.fn(() => c),
    insert: jest.fn(() => c),
    maybeSingle: jest.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
    single: jest.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve),
  };
  return c;
};
const seq = (...chains: ReturnType<typeof chain>[]) => chains.forEach((c) => mockFrom.mockReturnValueOnce(c));
const post = (body: unknown) =>
  new Request("https://api.hashpass.tech/api/pass-transfers", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const POST = (body: unknown) => require("../../app/api/pass-transfers+api").POST(post(body));

const future = () => new Date(Date.now() + 3_600_000).toISOString();
const pending = (over: Record<string, unknown> = {}) => ({
  id: "tr1", status: "pending", expires_at: future(), sender_token_hash: "s".repeat(64), recipient_token_hash: "r".repeat(64), ...over,
});

beforeEach(() => {
  jest.resetModules();
  mockResolveIdentity.mockReset().mockResolvedValue({ supabaseUserId: senderId, email: "sender@example.com" });
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockSendEmail.mockReset().mockResolvedValue({ success: true });
});

describe("POST /api/pass-transfers confirm", () => {
  it("is reachable without a session but validates the token shape", async () => {
    mockResolveIdentity.mockResolvedValue({ status: 401, error: "Unauthorized" });
    expect((await POST({ action: "confirm", token: "short" })).status).toBe(400);
    expect((await POST({ action: "confirm" })).status).toBe(400);
    expect(mockResolveIdentity).not.toHaveBeenCalled();
  });

  it("returns 503 when the transfer cannot be loaded", async () => {
    seq(chain({ error: { message: "x" } }));
    expect((await POST({ action: "confirm", token })).status).toBe(503);
  });

  it("returns 410 for unknown or non-pending transfers", async () => {
    seq(chain({ data: null }));
    expect((await POST({ action: "confirm", token })).status).toBe(410);
    seq(chain({ data: pending({ status: "completed" }) }));
    expect((await POST({ action: "confirm", token })).status).toBe(410);
  });

  it("reports a failure to mark an elapsed transfer expired", async () => {
    seq(chain({ data: pending({ expires_at: "2000-01-01T00:00:00Z" }) }), chain({ error: { message: "x" } }));
    expect((await POST({ action: "confirm", token })).status).toBe(503);
  });

  it("records the sender confirmation and waits for the recipient", async () => {
    const hash = require("node:crypto").createHash("sha256").update(token).digest("hex");
    const update = chain({});
    seq(
      chain({ data: pending({ sender_token_hash: hash }) }),
      update,
      chain({ data: { sender_confirmed_at: "now", recipient_confirmed_at: null, status: "pending" } }),
    );
    const res = await POST({ action: "confirm", token });
    expect(await res.json()).toEqual({ data: { requestId: "tr1", status: "confirmed" } });
    expect(update.update).toHaveBeenCalledWith({ sender_confirmed_at: expect.any(String) });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("records a recipient confirmation under the recipient column", async () => {
    const update = chain({});
    seq(chain({ data: pending() }), update, chain({ data: null }));
    const res = await POST({ action: "confirm", token });
    expect((await res.json()).data.status).toBe("confirmed");
    expect(update.update).toHaveBeenCalledWith({ recipient_confirmed_at: expect.any(String) });
  });

  it("reports update and re-read failures", async () => {
    seq(chain({ data: pending() }), chain({ error: { message: "x" } }));
    expect((await POST({ action: "confirm", token })).status).toBe(503);
    seq(chain({ data: pending() }), chain({}), chain({ error: { message: "x" } }));
    expect((await POST({ action: "confirm", token })).status).toBe(503);
  });

  describe("when both people have confirmed", () => {
    const both = () => seq(
      chain({ data: pending() }),
      chain({}),
      chain({ data: { sender_confirmed_at: "a", recipient_confirmed_at: "b", status: "pending" } }),
    );

    it("completes ownership through the atomic RPC", async () => {
      both();
      mockRpc.mockResolvedValueOnce({ data: true, error: null });
      const res = await POST({ action: "confirm", token });
      expect(await res.json()).toEqual({ data: { requestId: "tr1", status: "completed" } });
      expect(mockRpc).toHaveBeenCalledWith("complete_pass_transfer", { p_request_id: "tr1" });
    });

    it("surfaces RPC errors and a pass that changed", async () => {
      both();
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
      expect((await POST({ action: "confirm", token })).status).toBe(503);
      both();
      mockRpc.mockResolvedValueOnce({ data: false, error: null });
      expect((await POST({ action: "confirm", token })).status).toBe(409);
    });
  });
});

describe("POST /api/pass-transfers request", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    action: "request", passId, eventId: "colombia2026", recipientEmail: "Recipient@Example.com", ...over,
  });
  const pass = () => chain({ data: { id: passId, event_id: "colombia2026", status: "active", pass_type: "vip" } });
  const happyUntilInsert = () => seq(
    pass(),
    chain({}),
    chain({ data: { id: "a", provider_ids: { supabase: recipientId } } }),
    chain({ data: null }),
  );

  it("requires an authenticated, linked, verified-email caller", async () => {
    mockResolveIdentity.mockResolvedValueOnce({ status: 401, error: "Unauthorized" });
    expect((await POST(body())).status).toBe(401);
    mockResolveIdentity.mockResolvedValueOnce({ supabaseUserId: null, email: "a@b.co" });
    expect((await POST(body())).status).toBe(409);
    mockResolveIdentity.mockResolvedValueOnce({ supabaseUserId: senderId, email: "not-an-email" });
    expect((await POST(body())).status).toBe(403);
    mockResolveIdentity.mockResolvedValueOnce({ supabaseUserId: senderId });
    expect((await POST(body())).status).toBe(403);
  });

  it("defaults to the request action and rejects unknown actions and bad bodies", async () => {
    expect((await POST({ action: "nope" })).status).toBe(400);
    expect((await POST("not json")).status).toBe(400);
    expect((await POST({})).status).toBe(400);
  });

  it.each([
    ["bad pass id", { passId: "bad id!" }],
    ["missing event", { eventId: "" }],
    ["bad email", { recipientEmail: "nope" }],
    ["self transfer", { recipientEmail: "SENDER@example.com" }],
  ])("rejects %s", async (_n, over) => {
    expect((await POST(body(over))).status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects passes that are missing, inactive, unverifiable or for another event", async () => {
    seq(chain({ error: { message: "x" } }));
    expect((await POST(body())).status).toBe(503);
    seq(chain({ data: null }));
    expect((await POST(body())).status).toBe(403);
    seq(chain({ data: { id: passId, event_id: "colombia2026", status: "revoked" } }));
    expect((await POST(body())).status).toBe(403);
    seq(chain({ data: { id: passId, event_id: "other", status: "active" } }));
    expect((await POST(body())).status).toBe(409);
  });

  it("reports expiry and recipient lookup failures", async () => {
    seq(pass(), chain({ error: { message: "x" } }));
    expect((await POST(body())).status).toBe(503);
    seq(pass(), chain({}), chain({ error: { message: "x" } }));
    expect((await POST(body())).status).toBe(503);
  });

  it("requires an existing recipient account", async () => {
    seq(pass(), chain({}), chain({ data: null }));
    expect((await POST(body())).status).toBe(404);
    seq(pass(), chain({}), chain({ data: { id: "a", provider_ids: {} } }));
    expect((await POST(body())).status).toBe(404);
  });

  it("fails when the recipient's pass cannot be verified", async () => {
    seq(pass(), chain({}), chain({ data: { id: "a", provider_ids: { supabase: recipientId } } }), chain({ error: { message: "x" } }));
    expect((await POST(body())).status).toBe(503);
  });

  it("maps insert failures", async () => {
    happyUntilInsert();
    seq(chain({ error: { code: "23505", message: "dup" } }));
    expect((await POST(body())).status).toBe(409);
    happyUntilInsert();
    seq(chain({ error: { code: "XX", message: "x" } }));
    expect((await POST(body())).status).toBe(503);
    happyUntilInsert();
    seq(chain({ data: null }));
    expect((await POST(body())).status).toBe(503);
  });

  it("stores only token hashes and emails each party their own link", async () => {
    happyUntilInsert();
    const insert = chain({ data: { id: "tr1", expires_at: "2026-10-26T00:00:00Z" } });
    seq(insert);
    const res = await POST(body());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { requestId: "tr1", status: "pending", expiresAt: "2026-10-26T00:00:00Z" } });

    const row = insert.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      pass_id: passId, sender_user_id: senderId, recipient_user_id: recipientId, recipient_email: "recipient@example.com",
    });
    expect(row.sender_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.recipient_token_hash).not.toBe(row.sender_token_hash);

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const [sender, recipient] = mockSendEmail.mock.calls.map((c) => c[0]);
    expect(sender.recipientEmail).toBe("sender@example.com");
    expect(recipient.recipientEmail).toBe("recipient@example.com");
    expect(sender.actionUrl).toMatch(/\/transfer\/confirm\?token=[A-Za-z0-9_-]{43}$/);
    expect(sender.actionUrl).not.toBe(recipient.actionUrl);
    for (const mail of [sender, recipient]) {
      expect(mail.actionUrl).not.toContain(row.sender_token_hash);
      expect(mail.actionUrl).not.toContain(row.recipient_token_hash);
    }
  });

  describe("when a confirmation email cannot be delivered", () => {
    const cancel = () => {
      const c = chain({});
      return c;
    };
    const arrange = (cancelChain = cancel()) => {
      happyUntilInsert();
      seq(chain({ data: { id: "tr1", expires_at: "2026-10-26T00:00:00Z" } }), cancelChain);
      return cancelChain;
    };

    it.each([
      ["sender email reports failure", [{ success: false }, { success: true }]],
      ["recipient email reports failure", [{ success: true }, { success: false, error: "smtp" }]],
      ["both report failure", [{ success: false }, { success: false }]],
      ["an email resolves empty", [undefined, { success: true }]],
    ])("cancels the pending request and tells the sender to retry when %s", async (_n, results) => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      mockSendEmail.mockReset();
      results.forEach((r) => mockSendEmail.mockResolvedValueOnce(r));
      const cancelChain = arrange();
      const res = await POST(body());
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/could not send the confirmation emails/i);
      expect(cancelChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
      expect(cancelChain.eq).toHaveBeenCalledWith("id", "tr1");
      expect(cancelChain.eq).toHaveBeenCalledWith("status", "pending");
    });

    it("cancels even when a send throws, without losing the other result", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      mockSendEmail.mockReset().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ success: true });
      const cancelChain = arrange();
      expect((await POST(body())).status).toBe(503);
      expect(cancelChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
    });

    it("still reports the delivery failure if the cancellation itself fails", async () => {
      const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
      mockSendEmail.mockReset().mockResolvedValue({ success: false });
      arrange(chain({ error: { message: "db down" } }));
      expect((await POST(body())).status).toBe(503);
      expect(errors).toHaveBeenCalledWith(expect.stringContaining("unable to cancel"), "tr1");
    });

    it("keeps the request when both emails are delivered", async () => {
      const cancelChain = arrange();
      expect((await POST(body())).status).toBe(201);
      expect(cancelChain.update).not.toHaveBeenCalled();
    });
  });
});
