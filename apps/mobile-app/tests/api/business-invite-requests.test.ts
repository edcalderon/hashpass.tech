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
});
