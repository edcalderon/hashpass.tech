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

describe("business invite approval API", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveIdentity.mockReset();
    mockRpc.mockReset();
    mockSendEmail.mockReset();
    mockResolveIdentity.mockResolvedValue({
      supabaseUserId: "33333333-3333-3333-3333-333333333333",
      registryUserId: "registry-admin",
      email: "admin@example.com",
    });
    mockSendEmail.mockResolvedValue({ success: true });
  });

  it("lists pending requests only through the approver-checked RPC", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          user_id: "11111111-1111-1111-1111-111111111111",
          user_email: "requester@example.com",
          status: "pending",
          requested_at: "2026-09-25T00:00:00.000Z",
        },
      ],
      error: null,
    });

    const { GET } = require("../../app/api/admin/business-invites+api");
    const response = await GET(
      new Request(
        "https://api.hashpass.tech/api/admin/business-invites?status=pending",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      "list_business_invite_requests_for_approver",
      {
        p_actor_user_id: "33333333-3333-3333-3333-333333333333",
        p_status: "pending",
        p_limit: 100,
      },
    );
  });

  it("approves a pending request then sends the requester a transactional result email", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        request_id: "22222222-2222-2222-2222-222222222222",
        user_id: "11111111-1111-1111-1111-111111111111",
        status: "approved",
        already_reviewed: false,
      },
      error: null,
    });

    const { POST } = require("../../app/api/admin/business-invites+api");
    const response = await POST(
      new Request("https://api.hashpass.tech/api/admin/business-invites", {
        method: "POST",
        body: JSON.stringify({
          requestId: "22222222-2222-2222-2222-222222222222",
          decision: "approve",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("review_business_invite_request", {
      p_request_id: "22222222-2222-2222-2222-222222222222",
      p_actor_user_id: "33333333-3333-3333-3333-333333333333",
      p_decision: "approve",
    });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "11111111-1111-1111-1111-111111111111",
        notificationType: "business_invite_approved",
      }),
    );
  });

  it("does not leak request data to an unauthenticated caller", async () => {
    mockResolveIdentity.mockResolvedValueOnce({
      error: "Unauthorized",
      status: 401,
    });
    const { GET } = require("../../app/api/admin/business-invites+api");
    const response = await GET(
      new Request("https://api.hashpass.tech/api/admin/business-invites"),
    );
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
