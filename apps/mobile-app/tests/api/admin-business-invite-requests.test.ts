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

  it("rejects invalid reviewer input and identities before a protected RPC", async () => {
    const { GET, POST } = require("../../app/api/admin/business-invites+api");

    expect(
      (
        await GET(
          new Request(
            "https://api.hashpass.tech/api/admin/business-invites?status=unknown",
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          new Request("https://api.hashpass.tech/api/admin/business-invites", {
            method: "POST",
            body: JSON.stringify({ requestId: "not-a-uuid", decision: "grant" }),
          }),
        )
      ).status,
    ).toBe(400);

    mockResolveIdentity.mockResolvedValueOnce({ registryUserId: "registry-admin" });
    expect(
      (
        await GET(
          new Request("https://api.hashpass.tech/api/admin/business-invites"),
        )
      ).status,
    ).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("preserves meaningful reviewer RPC failures without exposing request data", async () => {
    const { GET, POST } = require("../../app/api/admin/business-invites+api");
    const makeGet = () =>
      new Request("https://api.hashpass.tech/api/admin/business-invites?status=pending&limit=12");
    const makePost = () =>
      new Request("https://api.hashpass.tech/api/admin/business-invites", {
        method: "POST",
        body: JSON.stringify({
          requestId: "22222222-2222-2222-2222-222222222222",
          decision: "approve",
        }),
      });

    for (const [message, expectedStatus] of [
      ["Business invitation approval is not authorized", 403],
      ["Business invitation request was not found", 404],
      ["Business invitation campaign is unavailable", 400],
      ["database connection lost", 503],
    ]) {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message } });
      expect((await GET(makeGet())).status).toBe(expectedStatus);
    }

    mockRpc.mockResolvedValueOnce({ data: { status: "approved" }, error: null });
    expect((await POST(makePost())).status).toBe(503);
  });

  it("emails rejection once but not an already reviewed request", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: {
          request_id: "22222222-2222-2222-2222-222222222222",
          user_id: "11111111-1111-1111-1111-111111111111",
          status: "rejected",
          already_reviewed: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          request_id: "22222222-2222-2222-2222-222222222222",
          user_id: "11111111-1111-1111-1111-111111111111",
          status: "approved",
          already_reviewed: true,
        },
        error: null,
      });
    mockSendEmail.mockResolvedValueOnce({ success: false });

    const { POST } = require("../../app/api/admin/business-invites+api");
    const makePost = () =>
      new Request("https://api.hashpass.tech/api/admin/business-invites", {
        method: "POST",
        body: JSON.stringify({
          requestId: "22222222-2222-2222-2222-222222222222",
          decision: "reject",
        }),
      });

    expect((await POST(makePost())).status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ notificationType: "business_invite_rejected" }),
    );
    expect((await POST(makePost())).status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
