/// <reference types="jest" />

const mockResolveIdentity = jest.fn();
const mockRpc = jest.fn();
const mockSendEmail = jest.fn();

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (...args: unknown[]) =>
    mockResolveIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) =>
    typeof value?.status === "number",
}));
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));
jest.mock("@/lib/email", () => ({
  sendCriticalNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

describe("POST /api/business-invites/requests", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveIdentity.mockReset();
    mockRpc.mockReset();
    mockSendEmail.mockReset();
    mockResolveIdentity.mockResolvedValue({
      supabaseUserId: "11111111-1111-1111-1111-111111111111",
      registryUserId: "registry-1",
      email: "requester@example.com",
    });
    mockSendEmail.mockResolvedValue({ success: true });
  });

  it("records a verified user request and alerts every configured approver once", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: {
          status: "pending",
          request_id: "22222222-2222-2222-2222-222222222222",
          created: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ user_id: "33333333-3333-3333-3333-333333333333" }],
        error: null,
      });

    const { POST } = require("../../app/api/business-invites/requests+api");
    const response = await POST(
      new Request("https://api.hashpass.tech/api/business-invites/requests", {
        method: "POST",
        body: JSON.stringify({ code: " 9899 " }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      status: "pending",
      request_id: "22222222-2222-2222-2222-222222222222",
      created: true,
    });
    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      "request_business_invite_for_user",
      {
        p_user_id: "11111111-1111-1111-1111-111111111111",
        p_code: "9899",
      },
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "33333333-3333-3333-3333-333333333333",
        notificationType: "business_invite_review_required",
        actionUrl: "https://hashpass.tech/dashboard/business-invites",
      }),
    );
  });

  it("does not send another approver email when the user already has a request", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        status: "pending",
        request_id: "22222222-2222-2222-2222-222222222222",
        created: false,
      },
      error: null,
    });

    const { POST } = require("../../app/api/business-invites/requests+api");
    const response = await POST(
      new Request("https://api.hashpass.tech/api/business-invites/requests", {
        method: "POST",
        body: JSON.stringify({ code: "9899" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("rejects invalid codes and identities before touching the approval RPC", async () => {
    const { POST } = require("../../app/api/business-invites/requests+api");
    const malformed = await POST(
      new Request("https://api.hashpass.tech/api/business-invites/requests", {
        method: "POST",
        body: JSON.stringify({ code: "bad code" }),
      }),
    );
    expect(malformed.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();

    mockResolveIdentity.mockResolvedValueOnce({
      error: "Unauthorized",
      status: 401,
    });
    const unauthorized = await POST(
      new Request("https://api.hashpass.tech/api/business-invites/requests", {
        method: "POST",
        body: JSON.stringify({ code: "9899" }),
      }),
    );
    expect(unauthorized.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("keeps account, invitation, and transient service failures distinguishable", async () => {
    const { POST } = require("../../app/api/business-invites/requests+api");
    const makeRequest = () =>
      new Request("https://api.hashpass.tech/api/business-invites/requests", {
        method: "POST",
        body: JSON.stringify({ code: "9899" }),
      });

    mockResolveIdentity.mockResolvedValueOnce({ registryUserId: "registry-1" });
    expect((await POST(makeRequest())).status).toBe(409);

    for (const [message, expectedStatus] of [
      ["Verify your email before requesting Business access", 403],
      ["Invalid or expired Business invitation code", 400],
      ["Database connection unavailable", 503],
    ]) {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message } });
      expect((await POST(makeRequest())).status).toBe(expectedStatus);
    }

    expect(
      (
        await POST(
          new Request("https://api.hashpass.tech/api/business-invites/requests", {
            method: "POST",
            body: "not-json",
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("keeps the pending request when approver delivery is best-effort", async () => {
    const { POST } = require("../../app/api/business-invites/requests+api");
    const makeRequest = () =>
      new Request("https://api.hashpass.tech/api/business-invites/requests", {
        method: "POST",
        body: JSON.stringify({ code: "9899" }),
      });
    const pending = {
      status: "pending",
      request_id: "22222222-2222-2222-2222-222222222222",
      created: true,
    };

    mockRpc
      .mockResolvedValueOnce({ data: pending, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "lookup unavailable" } });
    expect((await POST(makeRequest())).status).toBe(201);

    mockRpc
      .mockResolvedValueOnce({ data: pending, error: null })
      .mockResolvedValueOnce({
        data: [null, { user_id: "33333333-3333-3333-3333-333333333333" }],
        error: null,
      });
    mockSendEmail.mockResolvedValueOnce({ success: false });
    expect((await POST(makeRequest())).status).toBe(201);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "33333333-3333-3333-3333-333333333333",
      }),
    );

    mockRpc.mockResolvedValueOnce({ data: { status: "unknown" }, error: null });
    expect((await POST(makeRequest())).status).toBe(503);
  });
});
