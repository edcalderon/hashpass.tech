/// <reference types="jest" />

const mockResolveIdentity = jest.fn();
const mockFrom = jest.fn();
const mockSendEmail = jest.fn();

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === "number",
}));
jest.mock("@/lib/email", () => ({
  sendCriticalNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

const senderId = "11111111-1111-4111-8111-111111111111";
const recipientId = "22222222-2222-4222-8222-222222222222";
const passId = "33333333-3333-4333-8333-333333333333";

const query = (result: { data: unknown; error?: unknown }) => {
  const chain: Record<string, any> = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    lt: jest.fn(() => chain),
    or: jest.fn(() => chain),
    maybeSingle: jest.fn(async () => ({ data: result.data, error: result.error ?? null })),
    update: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    single: jest.fn(async () => ({ data: result.data, error: result.error ?? null })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve),
  };
  return chain;
};

const request = (body: Record<string, unknown>) => new Request(
  "https://api.hashpass.tech/api/pass-transfers",
  { method: "POST", body: JSON.stringify(body) },
);

describe("POST /api/pass-transfers", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveIdentity.mockReset().mockResolvedValue({
      supabaseUserId: senderId,
      email: "sender@example.com",
    });
    mockFrom.mockReset();
    mockSendEmail.mockReset().mockResolvedValue({ success: true });
  });

  it("expires an abandoned transfer before creating a replacement", async () => {
    const pass = query({
      data: { id: passId, event_id: "colombia2026", status: "active", pass_type: "business" },
    });
    const expirePending = query({ data: null });
    const recipient = query({ data: { id: "account-id", provider_ids: { supabase: recipientId } } });
    const noRecipientPass = query({ data: null });
    const created = query({ data: { id: "transfer-id", expires_at: "2026-10-26T00:00:00.000Z" } });
    mockFrom
      .mockReturnValueOnce(pass)
      .mockReturnValueOnce(expirePending)
      .mockReturnValueOnce(recipient)
      .mockReturnValueOnce(noRecipientPass)
      .mockReturnValueOnce(created);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require("../../app/api/pass-transfers+api");
    const response = await POST(request({
      action: "request",
      passId,
      eventId: "colombia2026",
      recipientEmail: "recipient@example.com",
    }));

    expect(response.status).toBe(201);
    expect(expirePending.update).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
    expect(expirePending.eq).toHaveBeenCalledWith("pass_id", passId);
    expect(expirePending.eq).toHaveBeenCalledWith("status", "pending");
    expect(expirePending.lt).toHaveBeenCalledWith("expires_at", expect.any(String));
  });

  it("rejects a recipient who already has an event pass before creating a transfer or sending email", async () => {
    const pass = query({
      data: { id: passId, event_id: "colombia2026", status: "active", pass_type: "business" },
    });
    const expirePending = query({ data: null });
    const recipient = query({ data: { id: "account-id", provider_ids: { supabase: recipientId } } });
    const recipientPass = query({ data: { id: "recipient-pass" } });
    mockFrom
      .mockReturnValueOnce(pass)
      .mockReturnValueOnce(expirePending)
      .mockReturnValueOnce(recipient)
      .mockReturnValueOnce(recipientPass);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require("../../app/api/pass-transfers+api");
    const response = await POST(request({
      action: "request",
      passId,
      eventId: "colombia2026",
      recipientEmail: "recipient@example.com",
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "The recipient already has a pass for this event" });
    expect(recipientPass.eq).toHaveBeenCalledWith("user_id", recipientId);
    expect(recipientPass.eq).toHaveBeenCalledWith("event_id", "colombia2026");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("marks an expired confirmation request before rejecting it", async () => {
    const expired = new Date(Date.now() - 60_000).toISOString();
    const transfer = query({
      data: {
        id: "transfer-id",
        status: "pending",
        expires_at: expired,
        sender_token_hash: "a".repeat(64),
        recipient_token_hash: "b".repeat(64),
      },
    });
    const markExpired = query({ data: null });
    mockFrom.mockReturnValueOnce(transfer).mockReturnValueOnce(markExpired);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require("../../app/api/pass-transfers+api");
    const response = await POST(request({ action: "confirm", token: "a".repeat(32) }));

    expect(response.status).toBe(410);
    expect(markExpired.update).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
    expect(markExpired.eq).toHaveBeenCalledWith("id", "transfer-id");
    expect(markExpired.eq).toHaveBeenCalledWith("status", "pending");
  });
});
