/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockIsResolveIdentityError = jest.fn();

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (request: Request) =>
    mockResolveNotificationIdentity(request),
  isResolveIdentityError: (identity: unknown) =>
    mockIsResolveIdentityError(identity),
}));

const mockEq = jest.fn();
const mockIn = jest.fn();
const mockOrder = jest.fn().mockResolvedValue({ data: [], error: null });
const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
const mockRpc = jest.fn();
const mockFrom = jest.fn(() => ({
  select: jest.fn(() => createChain()),
}));

function createChain(): {
  eq: (...args: unknown[]) => unknown;
  in: (...args: unknown[]) => unknown;
  order: jest.Mock;
  maybeSingle: jest.Mock;
} {
  return {
    eq: (...args: unknown[]) => {
      mockEq(...args);
      return createChain();
    },
    in: (...args: unknown[]) => {
      mockIn(...args);
      return createChain();
    },
    order: mockOrder,
    maybeSingle: mockMaybeSingle,
  };
}

jest.mock("@/lib/supabase-server", () => {
  return {
    getSupabaseServerForRequest: () => ({ from: mockFrom, rpc: mockRpc }),
  };
});

describe("meeting-requests api", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockIsResolveIdentityError.mockReset();
    mockEq.mockReset();
    mockIn.mockReset();
    mockOrder.mockClear();
    mockMaybeSingle.mockClear();
    mockRpc.mockReset();
    mockFrom.mockClear();
  });

  describe("GET", () => {
    it("returns empty array when user has no Supabase auth id", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: null,
        registryUserId: null,
      });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/bslatam/meeting-requests+api");
      const response = await GET(
        new Request(
          "https://api.hashpass.tech/api/bslatam/meeting-requests?speakerId=550e8400-e29b-41d4-a716-446655440000",
        ),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [] });
    });

    it("returns all of the authenticated user meeting requests when speakerId is missing", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
        registryUserId: "registry-id-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/bslatam/meeting-requests+api");
      const response = await GET(
        new Request("https://api.hashpass.tech/api/bslatam/meeting-requests"),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [] });
    });

    it("queries incoming requests with the speaker user UUID instead of the speaker slug", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
        registryUserId: "registry-id-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "claudia-sotelo", user_id: "auth-uuid-123" },
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/bslatam/meeting-requests+api");
      const response = await GET(
        new Request("https://api.hashpass.tech/api/bslatam/meeting-requests"),
      );

      expect(response.status).toBe(200);
      expect(mockEq).toHaveBeenCalledWith("speaker_id", "auth-uuid-123");
      expect(mockIn).not.toHaveBeenCalled();
    });

    it("applies a status filter to both sent and incoming request lists", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
        registryUserId: "registry-id-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/bslatam/meeting-requests+api");
      const response = await GET(
        new Request(
          "https://api.hashpass.tech/api/bslatam/meeting-requests?status=cancelled",
        ),
      );

      expect(response.status).toBe(200);
      expect(mockEq).toHaveBeenCalledWith("status", "cancelled");
    });

    it("returns empty array when speakerId is not a valid UUID", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
        registryUserId: "registry-id-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/bslatam/meeting-requests+api");
      const response = await GET(
        new Request(
          "https://api.hashpass.tech/api/bslatam/meeting-requests?speakerId=claudia-sotelo",
        ),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [] });
    });

    it("queries meeting_requests by the Supabase auth id, not the registry id", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
        registryUserId: "registry-id-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/bslatam/meeting-requests+api");
      await GET(
        new Request(
          "https://api.hashpass.tech/api/bslatam/meeting-requests?speakerId=550e8400-e29b-41d4-a716-446655440000",
        ),
      );

      expect(mockEq).toHaveBeenCalledWith("requester_id", "auth-uuid-123");
      expect(mockEq).not.toHaveBeenCalledWith(
        "requester_id",
        "registry-id-123",
      );
    });

    it("returns identity error if identity resolution fails", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        error: "Unauthorized",
        status: 401,
      });
      mockIsResolveIdentityError.mockReturnValue(true);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/bslatam/meeting-requests+api");
      const response = await GET(
        new Request(
          "https://api.hashpass.tech/api/bslatam/meeting-requests?speakerId=550e8400-e29b-41d4-a716-446655440000",
        ),
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });
  });

  describe("POST", () => {
    it("normalizes the set-returning insert RPC row for the speaker screen", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockRpc.mockResolvedValue({
        data: [{ id: "request-123", status: "pending" }],
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require("../../app/api/bslatam/meeting-requests+api");
      const response = await POST(
        new Request("https://api.hashpass.tech/api/bslatam/meeting-requests", {
          method: "POST",
          body: JSON.stringify({
            speakerId: "claudia-sotelo",
            speakerName: "Claudia Sotelo",
            requesterName: "Ada Lovelace",
          }),
        }),
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        data: { id: "request-123", status: "pending" },
      });
    });
  });

  describe("PATCH", () => {
    it("requires the requester id before a speaker can block a request", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
      });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require("../../app/api/bslatam/meeting-requests+api");
      const response = await PATCH(
        new Request("https://api.hashpass.tech/api/bslatam/meeting-requests", {
          method: "PATCH",
          body: JSON.stringify({ requestId: "request-123", action: "block" }),
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "requesterId is required to block a request",
      });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("accepts through the authenticated speaker and returns the confirmed meeting", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "speaker-record-id", user_id: "550e8400-e29b-41d4-a716-446655440000" },
        error: null,
      });
      mockRpc.mockResolvedValue({
        data: { success: true, status: "confirmed", meeting_id: "meeting-123" },
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require("../../app/api/bslatam/meeting-requests+api");
      const response = await PATCH(
        new Request("https://api.hashpass.tech/api/bslatam/meeting-requests", {
          method: "PATCH",
          body: JSON.stringify({
            requestId: "request-123",
            action: "accept",
            slotTime: "2026-08-15T14:00:00.000Z",
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith("accept_meeting_request", {
        p_request_id: "request-123",
        p_speaker_id: "speaker-record-id",
        p_slot_start_time: "2026-08-15T14:00:00.000Z",
        p_speaker_response: null,
      });
      expect(await response.json()).toEqual({
        data: { success: true, status: "confirmed", meeting_id: "meeting-123" },
      });
    });

    it("treats the Boolean result from the current cancel RPC as a success", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockRpc.mockResolvedValue({ data: true, error: null });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require("../../app/api/bslatam/meeting-requests+api");
      const response = await PATCH(
        new Request("https://api.hashpass.tech/api/bslatam/meeting-requests", {
          method: "PATCH",
          body: JSON.stringify({ requestId: "request-123", action: "cancel" }),
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: { success: true, status: "cancelled" },
      });
    });
  });
});
