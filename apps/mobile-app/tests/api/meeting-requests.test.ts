/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockIsResolveIdentityError = jest.fn();
const mockSendMeetingNotificationEmail = jest.fn().mockResolvedValue({ success: true });

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (request: Request) =>
    mockResolveNotificationIdentity(request),
  isResolveIdentityError: (identity: unknown) =>
    mockIsResolveIdentityError(identity),
}));

jest.mock("@/lib/email", () => ({
  sendMeetingNotificationEmail: (...args: unknown[]) => mockSendMeetingNotificationEmail(...args),
  sendCriticalNotificationEmail: jest.fn().mockResolvedValue({ success: true }),
}));

const mockEq = jest.fn();
const mockIn = jest.fn();
const mockOrder = jest.fn().mockResolvedValue({ data: [], error: null });
const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
const mockMeetingRequestMaybeSingle = jest
  .fn()
  .mockResolvedValue({ data: { id: "request-123" }, error: null });
const mockSpeakerIn = jest.fn().mockResolvedValue({ data: [], error: null });
const mockRpc = jest.fn();
const mockFrom = jest.fn((table: string) => table === "bsl_speakers"
  ? { select: jest.fn(() => createSpeakerChain()) }
  : { select: jest.fn(() => createChain(table)) });

function createSpeakerChain(): {
  eq: (...args: unknown[]) => unknown;
  in: (...args: unknown[]) => unknown;
  maybeSingle: jest.Mock;
} {
  return {
    eq: (...args: unknown[]) => {
      mockEq(...args);
      return createSpeakerChain();
    },
    in: (...args: unknown[]) => mockSpeakerIn(...args),
    maybeSingle: mockMaybeSingle,
  };
}
let consoleErrorSpy: jest.SpyInstance;

function createChain(table?: string): {
  eq: (...args: unknown[]) => unknown;
  in: (...args: unknown[]) => unknown;
  order: jest.Mock;
  maybeSingle: jest.Mock;
} {
  return {
    eq: (...args: unknown[]) => {
      mockEq(...args);
      return createChain(table);
    },
    in: (...args: unknown[]) => {
      mockIn(...args);
      return createChain(table);
    },
    order: mockOrder,
    maybeSingle:
      table === "meeting_requests"
        ? mockMeetingRequestMaybeSingle
        : mockMaybeSingle,
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
    mockOrder.mockReset();
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockMaybeSingle.mockReset();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockMeetingRequestMaybeSingle.mockReset();
    mockMeetingRequestMaybeSingle.mockResolvedValue({
      data: { id: "request-123" },
      error: null,
    });
    mockSpeakerIn.mockReset();
    mockSpeakerIn.mockResolvedValue({ data: [], error: null });
    mockRpc.mockReset();
    mockSendMeetingNotificationEmail.mockClear();
    mockFrom.mockClear();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => consoleErrorSpy.mockRestore());

  describe("GET", () => {
    it("returns empty array when user has no Supabase auth id", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: null,
        registryUserId: null,
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "speaker-record-id", user_id: "speaker-user-id" },
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request(
          "https://api.hashpass.tech/api/events/bsl/meetings/requests?speakerId=550e8400-e29b-41d4-a716-446655440000",
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
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "speaker-record-id", user_id: "speaker-user-id" },
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests"),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [] });
    });

    it("combines sent and incoming requests with their direction", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "speaker-record-id", user_id: "auth-uuid-123" },
        error: null,
      });
      mockOrder
        .mockResolvedValueOnce({ data: [{ id: "sent-request" }], error: null })
        .mockResolvedValueOnce({
          data: [{ id: "incoming-request" }],
          error: null,
        });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests"),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: [
          { id: "sent-request", _direction: "sent" },
          { id: "incoming-request", _direction: "incoming" },
        ],
      });
    });

    it("adds the claimed speaker’s current role and company to request details", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "speaker-record-id", user_id: "speaker-user-id" },
        error: null,
      });
      mockOrder
        .mockResolvedValueOnce({
          data: [{ id: "sent-request", speaker_id: "speaker-user-id" }],
          error: null,
        })
        .mockResolvedValueOnce({ data: [], error: null });
      mockSpeakerIn.mockResolvedValueOnce({
        data: [{
          user_id: "speaker-user-id",
          title: "Founder & CEO",
          company: "Hashpass",
          imageurl: "https://cdn.hashpass.tech/edward.png",
        }],
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request("https://api.hashpass.tech/api/events/chile2026/meetings/requests"),
      );

      expect(await response.json()).toEqual({
        data: [{
          id: "sent-request",
          speaker_id: "speaker-user-id",
          speaker_title: "Founder & CEO",
          speaker_company: "Hashpass",
          speaker_image: "https://cdn.hashpass.tech/edward.png",
          _direction: "sent",
        }],
      });
      expect(mockSpeakerIn).toHaveBeenCalledWith("user_id", ["speaker-user-id"]);
    });

    it("preserves requests when a speaker no longer has a live profile record", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: "auth-uuid-123" });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      mockOrder.mockResolvedValueOnce({
        data: [{ id: "sent-request", speaker_id: "removed-speaker-user-id" }], error: null,
      });
      mockSpeakerIn.mockResolvedValueOnce({ data: [], error: null });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request("https://api.hashpass.tech/api/events/chile2026/meetings/requests"),
      );

      await expect(response.json()).resolves.toEqual({
        data: [{ id: "sent-request", speaker_id: "removed-speaker-user-id", _direction: "sent" }],
      });
    });

    it("returns the request list when the speaker profile enrichment lookup fails", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: "auth-uuid-123" });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      mockOrder.mockResolvedValueOnce({
        data: [{ id: "sent-request", speaker_id: "speaker-user-id" }], error: null,
      });
      mockSpeakerIn.mockResolvedValueOnce({ data: null, error: { message: "profile lookup failed" } });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request("https://api.hashpass.tech/api/events/chile2026/meetings/requests"),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        data: [{ id: "sent-request", speaker_id: "speaker-user-id", _direction: "sent" }],
      });
    });

    it("queries incoming requests with the Supabase speaker user id", async () => {
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
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests"),
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
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request(
          "https://api.hashpass.tech/api/events/bsl/meetings/requests?status=cancelled",
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
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request(
          "https://api.hashpass.tech/api/events/bsl/meetings/requests?speakerId=claudia-sotelo",
        ),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [] });
    });

    it("queries meeting_requests by the Supabase auth id", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
        registryUserId: "registry-id-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "speaker-record-id", user_id: "speaker-user-id" },
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      await GET(
        new Request(
          "https://api.hashpass.tech/api/events/bsl/meetings/requests?speakerId=550e8400-e29b-41d4-a716-446655440000",
        ),
      );

      expect(mockEq).toHaveBeenCalledWith("requester_id", "auth-uuid-123");
      expect(mockEq).not.toHaveBeenCalledWith("requester_id", "registry-id-123");
    });

    it("isolates a speaker request list to the event in its URL", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "speaker-record-id", user_id: "speaker-user-id" },
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request(
          "https://api.hashpass.tech/api/events/chile2026/meetings/requests?speakerId=550e8400-e29b-41d4-a716-446655440000",
        ),
      );

      expect(response.status).toBe(200);
      expect(mockEq).toHaveBeenCalledWith("event_id", "chile2026");
    });

    it("resolves a speaker record id to its user id before filtering requests", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "550e8400-e29b-41d4-a716-446655440000", user_id: "speaker-user-id" },
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      await GET(
        new Request(
          "https://api.hashpass.tech/api/events/bsl/meetings/requests?speakerId=550e8400-e29b-41d4-a716-446655440000",
        ),
      );

      expect(mockEq).toHaveBeenCalledWith("speaker_id", "speaker-user-id");
      expect(mockEq).not.toHaveBeenCalledWith(
        "speaker_id",
        "550e8400-e29b-41d4-a716-446655440000",
      );
    });

    it("returns identity error if identity resolution fails", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        error: "Unauthorized",
        status: 401,
      });
      mockIsResolveIdentityError.mockReturnValue(true);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request(
          "https://api.hashpass.tech/api/events/bsl/meetings/requests?speakerId=550e8400-e29b-41d4-a716-446655440000",
        ),
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });

    it("returns a safe failure when looking up the speaker profile fails", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: { message: "speaker lookup failed" },
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await GET(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests"),
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "Failed to fetch meeting requests",
      });
    });

    it("returns a safe failure when sent, incoming, or speaker-specific queries fail", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "auth-uuid-123",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockOrder.mockResolvedValueOnce({
        data: null,
        error: { message: "sent query failed" },
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const sentFailure = await GET(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests"),
      );

      expect(sentFailure.status).toBe(500);

      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "speaker-record-id", user_id: "auth-uuid-123" },
        error: null,
      });
      mockOrder
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({
          data: null,
          error: { message: "incoming query failed" },
        });
      const incomingFailure = await GET(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests"),
      );

      expect(incomingFailure.status).toBe(500);

      mockOrder.mockResolvedValueOnce({
        data: null,
        error: { message: "speaker query failed" },
      });
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "speaker-record-id", user_id: "speaker-user-id" },
        error: null,
      });
      const speakerFailure = await GET(
        new Request(
          "https://api.hashpass.tech/api/events/bsl/meetings/requests?speakerId=550e8400-e29b-41d4-a716-446655440000",
        ),
      );

      expect(speakerFailure.status).toBe(500);
    });
  });

  describe("POST", () => {
    it("emails both the speaker and requester when a meeting request is created", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "requester-auth-id",
        registryUserId: "registry-requester-id",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockRpc.mockResolvedValue({
        data: { success: true, id: "request-123", speaker_id: "speaker-auth-id" },
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await POST(new Request("https://api.hashpass.tech/api/events/chile2026/meetings/requests", {
        method: "POST",
        body: JSON.stringify({ speakerId: "claudia-sotelo", speakerName: "Claudia Sotelo", requesterName: "Ada Lovelace" }),
      }));

      expect(response.status).toBe(201);
      expect(mockSendMeetingNotificationEmail).toHaveBeenCalledTimes(2);
      expect(mockSendMeetingNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({
        recipientUserId: "speaker-auth-id", recipientRole: "speaker", status: "requested",
      }));
      expect(mockSendMeetingNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({
        recipientUserId: "requester-auth-id", recipientRole: "requester", status: "requested",
      }));
    });

    it("passes the URL event id into the request creation contract", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
        registryUserId: "registry-requester-id",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockRpc.mockResolvedValue({
        data: { id: "request-123", status: "pending" },
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await POST(
        new Request(
          "https://api.hashpass.tech/api/events/chile2026/meetings/requests",
          {
            method: "POST",
            body: JSON.stringify({
              speakerId: "claudia-sotelo",
              speakerName: "Claudia Sotelo",
              requesterName: "Ada Lovelace",
            }),
          },
        ),
      );

      expect(response.status).toBe(201);
      expect(mockRpc).toHaveBeenCalledWith(
        "insert_meeting_request",
        expect.objectContaining({ p_event_id: "chile2026" }),
      );
    });

    it("normalizes the set-returning insert RPC row for the speaker screen", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
        registryUserId: "registry-requester-id",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockRpc.mockResolvedValue({
        data: [{ id: "request-123", status: "pending" }],
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await POST(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "POST",
          body: JSON.stringify({
            speakerId: "claudia-sotelo",
            speakerName: "Claudia Sotelo",
            requesterName: "Ada Lovelace",
            requesterCompany: "Analytical Engines",
            requesterTitle: "Programmer",
            requesterTicketType: "vip",
            meetingType: "partnership",
            message: "Let's meet",
            note: "Bring notes",
            boostAmount: 12,
            durationMinutes: 30,
          }),
        }),
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        data: { id: "request-123", status: "pending" },
      });
      expect(mockRpc).toHaveBeenCalledWith("insert_meeting_request", {
        p_requester_id: "550e8400-e29b-41d4-a716-446655440000",
        p_speaker_id: "claudia-sotelo",
        p_speaker_name: "Claudia Sotelo",
        p_requester_name: "Ada Lovelace",
        p_requester_company: "Analytical Engines",
        p_requester_title: "Programmer",
        p_requester_ticket_type: "vip",
        p_meeting_type: "partnership",
        p_message: "Let's meet",
        p_note: "Bring notes",
        p_boost_amount: 12,
        p_duration_minutes: 30,
        p_event_id: "bsl",
      });
    });

    it.each([
      ["a negative duration", -15],
      ["a zero duration", 0],
      ["a NaN duration", "NaN"],
      ["an infinite duration", "Infinity"],
      ["a duration above the 30-minute meeting limit", 31],
    ])("rejects %s before invoking the meeting request RPC", async (_label, durationMinutes) => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
      });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await POST(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "POST",
          body: JSON.stringify({
            speakerId: "claudia-sotelo",
            speakerName: "Claudia Sotelo",
            requesterName: "Ada Lovelace",
            durationMinutes,
          }),
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "durationMinutes must be between 5 and 30 minutes",
      });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("sends a supported positive duration to the meeting request RPC", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockRpc.mockResolvedValue({
        data: { id: "request-123", status: "pending" },
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await POST(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "POST",
          body: JSON.stringify({
            speakerId: "claudia-sotelo",
            speakerName: "Claudia Sotelo",
            requesterName: "Ada Lovelace",
            durationMinutes: 15,
          }),
        }),
      );

      expect(response.status).toBe(201);
      expect(mockRpc).toHaveBeenCalledWith(
        "insert_meeting_request",
        expect.objectContaining({ p_duration_minutes: 15 }),
      );
    });

    it("rejects unauthenticated, unlinked, malformed, and incomplete requests", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        error: "Unauthorized",
        status: 401,
      });
      mockIsResolveIdentityError.mockReturnValue(true);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const unauthorized = await POST(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
      expect(unauthorized.status).toBe(401);

      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: null,
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      const unlinked = await POST(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
      expect(unlinked.status).toBe(403);

      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "requester-id",
      });
      const malformed = await POST(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "POST",
          body: "not-json",
        }),
      );
      expect(malformed.status).toBe(400);

      const incomplete = await POST(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "POST",
          body: JSON.stringify({ speakerId: "speaker-id" }),
        }),
      );
      expect(incomplete.status).toBe(400);
    });

    it("surfaces business rejections and RPC failures without creating a request", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "requester-id",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockRpc.mockResolvedValueOnce({
        data: { success: false, error: "Existing request" },
        error: null,
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { POST } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const rejected = await POST(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "POST",
          body: JSON.stringify({
            speakerId: "speaker-id",
            speakerName: "Speaker",
            requesterName: "Requester",
          }),
        }),
      );

      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toEqual({ error: "Existing request" });

      mockRpc.mockRejectedValueOnce(new Error("database unavailable"));
      const failed = await POST(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "POST",
          body: JSON.stringify({
            speakerId: "speaker-id",
            speakerName: "Speaker",
            requesterName: "Requester",
          }),
        }),
      );

      expect(failed.status).toBe(500);
      expect(await failed.json()).toEqual({ error: "database unavailable" });
    });
  });

  describe("PATCH", () => {
    it("does not mutate a request outside the event in the URL", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "requester-id",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMeetingRequestMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      mockRpc.mockResolvedValue({ data: true, error: null });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await PATCH(
        new Request("https://api.hashpass.tech/api/events/chile2026/meetings/requests", {
          method: "PATCH",
          body: JSON.stringify({ requestId: "request-123", action: "cancel" }),
        }),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "Meeting request was not found for this event",
      });
      expect(mockEq).toHaveBeenCalledWith("event_id", "chile2026");
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("requires the requester id before a speaker can block a request", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
      });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await PATCH(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
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
      const { PATCH } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await PATCH(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
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

    it.each(["accept", "decline"])("emails both participants when a speaker chooses to %s", async (action) => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "speaker-auth-id",
        registryUserId: "registry-speaker-id",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMeetingRequestMaybeSingle.mockResolvedValueOnce({
        data: {
          id: "request-123",
          requester_id: "requester-auth-id",
          requester_name: "Ada Lovelace",
          speaker_name: "Claudia Sotelo",
          message: "Let's meet",
          meeting_type: "networking",
          duration_minutes: 15,
        },
        error: null,
      });
      mockMaybeSingle.mockResolvedValueOnce({ data: { id: "speaker-record-id" }, error: null });
      mockRpc.mockResolvedValue({ data: { success: true, status: action === "accept" ? "confirmed" : "declined" }, error: null });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await PATCH(new Request("https://api.hashpass.tech/api/events/chile2026/meetings/requests", {
        method: "PATCH",
        body: JSON.stringify({
          requestId: "request-123",
          action,
          ...(action === "accept" ? { slotTime: "2026-08-15T14:00:00.000Z" } : {}),
        }),
      }));

      expect(response.status).toBe(200);
      expect(mockSendMeetingNotificationEmail).toHaveBeenCalledTimes(2);
      const expectedStatus = action === "accept" ? "accepted" : "declined";
      expect(mockSendMeetingNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({
        recipientUserId: "requester-auth-id", recipientRole: "requester", status: expectedStatus,
      }));
      expect(mockSendMeetingNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({
        recipientUserId: "speaker-auth-id", recipientRole: "speaker", status: expectedStatus,
      }));
    });

    it("treats the Boolean result from the current cancel RPC as a success", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "550e8400-e29b-41d4-a716-446655440000",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockRpc.mockResolvedValue({ data: true, error: null });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const response = await PATCH(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "PATCH",
          body: JSON.stringify({ requestId: "request-123", action: "cancel" }),
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: { success: true, status: "cancelled" },
      });
    });

    it("rejects malformed actions and unlinked accounts", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "speaker-id",
      });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const malformed = await PATCH(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "PATCH",
          body: JSON.stringify({ requestId: "request-123", action: "reschedule" }),
        }),
      );
      expect(malformed.status).toBe(400);

      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: null,
      });
      const unlinked = await PATCH(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "PATCH",
          body: JSON.stringify({ requestId: "request-123", action: "cancel" }),
        }),
      );
      expect(unlinked.status).toBe(403);
    });

    it("requires an assigned speaker and a slot before accepting", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "speaker-user-id",
      });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const notSpeaker = await PATCH(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "PATCH",
          body: JSON.stringify({ requestId: "request-123", action: "decline" }),
        }),
      );
      expect(notSpeaker.status).toBe(403);

      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "speaker-record-id" },
        error: null,
      });
      const missingSlot = await PATCH(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "PATCH",
          body: JSON.stringify({ requestId: "request-123", action: "accept" }),
        }),
      );
      expect(missingSlot.status).toBe(400);
    });

    it("declines and blocks through the assigned speaker", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "speaker-user-id",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockMaybeSingle
        .mockResolvedValueOnce({ data: { id: "speaker-record-id" }, error: null })
        .mockResolvedValueOnce({ data: { id: "speaker-record-id" }, error: null });
      mockRpc
        .mockResolvedValueOnce({ data: { success: true, status: "declined" }, error: null })
        .mockResolvedValueOnce({ data: { success: true, status: "declined" }, error: null });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const declined = await PATCH(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "PATCH",
          body: JSON.stringify({
            requestId: "request-123",
            action: "decline",
            response: "No room this week",
          }),
        }),
      );
      expect(declined.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith("decline_meeting_request", {
        p_request_id: "request-123",
        p_speaker_id: "speaker-record-id",
        p_speaker_response: "No room this week",
      });

      const blocked = await PATCH(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "PATCH",
          body: JSON.stringify({
            requestId: "request-456",
            action: "block",
            requesterId: "requester-id",
            reason: "Abusive messages",
          }),
        }),
      );
      expect(blocked.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith("block_user_and_decline_request", {
        p_request_id: "request-456",
        p_speaker_id: "speaker-record-id",
        p_user_id: "requester-id",
        p_reason: "Abusive messages",
      });
    });

    it("returns conflict and RPC error responses from lifecycle actions", async () => {
      mockResolveNotificationIdentity.mockResolvedValue({
        supabaseUserId: "requester-id",
      });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockRpc
        .mockResolvedValueOnce({ data: false, error: null })
        .mockRejectedValueOnce(new Error("update unavailable"));

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require("../../app/api/events/[eventId]/meetings/requests+api");
      const conflict = await PATCH(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "PATCH",
          body: JSON.stringify({ requestId: "request-123", action: "cancel" }),
        }),
      );
      expect(conflict.status).toBe(409);

      const failed = await PATCH(
        new Request("https://api.hashpass.tech/api/events/bsl/meetings/requests", {
          method: "PATCH",
          body: JSON.stringify({ requestId: "request-123", action: "cancel" }),
        }),
      );
      expect(failed.status).toBe(500);
      expect(await failed.json()).toEqual({ error: "update unavailable" });
    });
  });
});

describe('meetingFrontendOrigin', () => {
  const originalBslSiteUrl = process.env.EXPO_PUBLIC_BSL_SITE_URL;

  afterEach(() => {
    if (originalBslSiteUrl === undefined) delete process.env.EXPO_PUBLIC_BSL_SITE_URL;
    else process.env.EXPO_PUBLIC_BSL_SITE_URL = originalBslSiteUrl;
  });

  it('uses the development BSL site for API development requests', () => {
    delete process.env.EXPO_PUBLIC_BSL_SITE_URL;
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { meetingFrontendOrigin } = require('../../app/api/events/[eventId]/meetings/requests+api');
    expect(meetingFrontendOrigin(new Request('https://api-dev.hashpass.tech/api/events/bsl/meetings/requests')))
      .toBe('https://bsl-dev.hashpass.tech');
  });

  it('prefers an explicitly configured BSL site origin', () => {
    process.env.EXPO_PUBLIC_BSL_SITE_URL = 'https://preview-bsl.hashpass.tech/path';
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { meetingFrontendOrigin } = require('../../app/api/events/[eventId]/meetings/requests+api');
    expect(meetingFrontendOrigin(new Request('https://api.hashpass.tech/api/events/bsl/meetings/requests')))
      .toBe('https://preview-bsl.hashpass.tech');
  });
});
