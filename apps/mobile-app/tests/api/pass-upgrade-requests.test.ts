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

const id = "11111111-1111-4111-8111-111111111111";
const passId = "22222222-2222-4222-8222-222222222222";

const query = (result: { data: unknown; error?: unknown }) => {
  const chain: Record<string, any> = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    maybeSingle: jest.fn(async () => result),
    insert: jest.fn(() => chain),
    single: jest.fn(async () => result),
  };
  return chain;
};

const makeRequest = (body: Record<string, unknown>) => new Request(
  "https://api.hashpass.tech/api/pass-upgrade-requests",
  { method: "POST", body: JSON.stringify(body) },
);

describe("POST /api/pass-upgrade-requests", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveIdentity.mockReset().mockResolvedValue({ supabaseUserId: id });
    mockFrom.mockReset();
    mockSendEmail.mockReset().mockResolvedValue({ success: true });
  });

  it("validates identity and request shape before touching the database", async () => {
    const { POST } = require("../../app/api/pass-upgrade-requests+api");
    expect((await POST(makeRequest({ passId: "bad", requestedPassType: "vip" }))).status).toBe(400);
    mockResolveIdentity.mockResolvedValueOnce({ error: "Unauthorized", status: 401 });
    expect((await POST(makeRequest({ passId, requestedPassType: "vip" }))).status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects mismatched, inactive, and non-adjacent pass upgrades", async () => {
    const { POST } = require("../../app/api/pass-upgrade-requests+api");
    mockFrom.mockReturnValue(query({ data: null, error: null }));
    expect((await POST(makeRequest({ passId, eventId: "other", requestedPassType: "vip" }))).status).toBe(403);

    mockFrom.mockReturnValue(query({ data: { id: passId, user_id: id, event_id: "colombia2026", pass_type: "general", status: "expired" }, error: null }));
    expect((await POST(makeRequest({ passId, eventId: "colombia2026", requestedPassType: "business" }))).status).toBe(403);

    mockFrom.mockReturnValue(query({ data: { id: passId, user_id: id, event_id: "colombia2026", pass_type: "general", status: "active" }, error: null }));
    expect((await POST(makeRequest({ passId, eventId: "colombia2026", requestedPassType: "vip" }))).status).toBe(400);
  });

  it("returns an existing pending request without sending duplicate email", async () => {
    const { POST } = require("../../app/api/pass-upgrade-requests+api");
    const pass = query({ data: { id: passId, user_id: id, event_id: "colombia2026", pass_type: "general", status: "active" }, error: null });
    const pending = query({ data: { id: "request-1", status: "pending", current_pass_type: "general", requested_pass_type: "business" }, error: null });
    mockFrom.mockReturnValueOnce(pass).mockReturnValueOnce(pending);
    const response = await POST(makeRequest({ passId, eventId: "colombia2026", requestedPassType: "business" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { status: "already_pending" } });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("creates a request and notifies all configured reviewers", async () => {
    const { POST } = require("../../app/api/pass-upgrade-requests+api");
    const pass = query({ data: { id: passId, user_id: id, event_id: "colombia2026", pass_type: "general", status: "active" }, error: null });
    const noPending = query({ data: null, error: null });
    const created = query({ data: { id: "request-2", status: "pending", current_pass_type: "general", requested_pass_type: "business" }, error: null });
    mockFrom.mockReturnValueOnce(pass).mockReturnValueOnce(noPending).mockReturnValueOnce(created);
    const response = await POST(makeRequest({ passId, eventId: "colombia2026", requestedPassType: "business", ticketReference: "BSL-42" }));
    expect(response.status).toBe(201);
    expect(noPending.eq).toHaveBeenCalledWith("status", "pending");
    expect(created.insert).toHaveBeenCalledWith(expect.objectContaining({ ticket_reference: "BSL-42" }));
    expect(mockSendEmail).toHaveBeenCalledTimes(3);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ notificationType: "pass_upgrade_review_required" }));
  });
});
