/// <reference types="jest" />

const mockResolveIdentity = jest.fn();
const mockIsIdentityError = jest.fn();
const mockFrom = jest.fn();
const mockGetUserById = jest.fn();

const userId = "7f60f5d2-5948-4df1-9670-2f9177cf2fe4";

const queryResult = (data: unknown, error: unknown = null) => {
  const query: Record<string, any> = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    gt: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(() => query),
    maybeSingle: jest.fn(async () => ({ data, error })),
    insert: jest.fn((payload: unknown) => {
      query.inserted = payload;
      return query;
    }),
    rpc: jest.fn((name: string, params: unknown) => {
      query.rpcName = name;
      query.rpcParams = params;
      return query;
    }),
    upsert: jest.fn((payload: unknown) => {
      query.upserted = payload;
      return query;
    }),
    single: jest.fn(async () => ({ data: data ?? { id: "chat-message-1" }, error })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  return query;
};

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (request: Request) => mockResolveIdentity(request),
  isResolveIdentityError: (identity: unknown) => mockIsIdentityError(identity),
}));

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({
    from: mockFrom,
    rpc: (name: string, params: unknown) => {
      const query = mockFrom("event_chat_messages");
      query.rpcName = name;
      query.rpcParams = params;
      return query;
    },
    auth: { admin: { getUserById: (...args: unknown[]) => mockGetUserById(...args) } },
  }),
}));

describe("event chat authorization api", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveIdentity.mockReset();
    mockIsIdentityError.mockReset();
    mockFrom.mockReset();
    mockGetUserById.mockReset();
    mockResolveIdentity.mockResolvedValue({ supabaseUserId: userId });
    mockIsIdentityError.mockReturnValue(false);
  });

  const post = async (body: Record<string, unknown>) => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { POST } = require("../../app/api/events/[eventId]/chat+api");
    return POST(
      new Request("https://api.hashpass.tech/api/events/colombia2026/chat", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  };

  const get = async (eventId = "colombia2026") => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/chat+api");
    return GET(
      new Request(`https://api.hashpass.tech/api/events/${eventId}/chat?channel=room`),
    );
  };

  it("allows general pass holders to read but never send to the room", async () => {
    const roomQuery = queryResult({ event_id: "colombia2026" });
    const passQuery = queryResult([{ pass_type: "general" }]);
    mockFrom.mockImplementation((table: string) => {
      if (table === "event_chat_rooms") return roomQuery;
      if (table === "passes") return passQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await post({ action: "send", message: "hello" });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "A business or VIP pass is required to send room messages",
    });
    expect(passQuery.insert).not.toHaveBeenCalled();
  });

  it("requires the recipient to hold a pass before a VIP can start a direct message", async () => {
    const roomQuery = queryResult({ event_id: "colombia2026" });
    const passQueries = [
      queryResult([{ pass_type: "vip" }]),
      queryResult([]),
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === "event_chat_rooms") return roomQuery;
      if (table !== "passes") throw new Error(`Unexpected table ${table}`);
      return passQueries.shift();
    });

    const response = await post({
      action: "send",
      channel: "direct",
      recipientId: "c1c4f770-7ad6-4f8c-96c4-5b7e6e2ee2ef",
      message: "hello",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "The recipient must hold an active pass for this event",
    });
  });

  it("keeps direct-message replies inside the selected conversation", async () => {
    const roomQuery = queryResult({ event_id: "colombia2026" });
    const passQueries = [
      queryResult([{ pass_type: "vip" }]),
      queryResult([{ pass_type: "business" }]),
    ];
    const replyQuery = queryResult({
      id: "reply-1",
      event_id: "colombia2026",
      sender_id: "c1c4f770-7ad6-4f8c-96c4-5b7e6e2ee2ef",
      recipient_id: "11111111-1111-4111-8111-111111111111",
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "event_chat_rooms") return roomQuery;
      if (table === "passes") return passQueries.shift();
      if (table === "event_chat_direct_messages") return replyQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await post({
      action: "send",
      channel: "direct",
      recipientId: "c1c4f770-7ad6-4f8c-96c4-5b7e6e2ee2ef",
      replyToMessageId: "6f9e2d7e-94ae-4f08-9f25-8b0b1db4e7a1",
      message: "hello",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "The reply target is not part of this direct conversation",
    });
  });

  it("lets business pass holders send room emoji messages through the serialized server function", async () => {
    const roomQuery = queryResult({ event_id: "colombia2026" });
    const passQuery = queryResult([{ pass_type: "business" }]);
    const messageQuery = queryResult(null);
    mockFrom.mockImplementation((table: string) => {
      if (table === "event_chat_rooms") return roomQuery;
      if (table === "passes") return passQuery;
      if (table === "event_chat_messages") return messageQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await post({
      action: "send",
      channel: "room",
      message: "🎉",
      messageType: "emoji",
    });

    expect(response.status).toBe(201);
    expect(messageQuery.rpcName).toBe("send_event_chat_room_message");
    expect(messageQuery.rpcParams).toEqual({
      p_event_id: "colombia2026",
      p_sender_id: userId,
      p_message: "🎉",
      p_message_type: "emoji",
      p_sender_display_name: null,
      p_reply_to_message_id: null,
    });
  });

  it("blocks the sixth consecutive room message until another attendee replies", async () => {
    const roomQuery = queryResult({ event_id: "colombia2026" });
    const passQuery = queryResult([{ pass_type: "business" }]);
    const messageQuery = queryResult(null, {
      code: "P0001",
      message: "A reply from another attendee is required before you can send another message",
      details: "CHAT_RATE_LIMIT",
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "event_chat_rooms") return roomQuery;
      if (table === "passes") return passQuery;
      if (table === "event_chat_messages") return messageQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await post({ action: "send", channel: "room", message: "message six" });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "A reply from another attendee is required before you can send another message",
      code: "CHAT_RATE_LIMIT",
    });
  });

  it("passes a room reply target to the serialized send function", async () => {
    const roomQuery = queryResult({ event_id: "colombia2026" });
    const passQuery = queryResult([{ pass_type: "vip" }]);
    const messageQuery = queryResult({ id: "chat-message-2" });
    mockFrom.mockImplementation((table: string) => {
      if (table === "event_chat_rooms") return roomQuery;
      if (table === "passes") return passQuery;
      if (table === "event_chat_messages") return messageQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await post({
      action: "send",
      channel: "room",
      message: "Thanks for the update",
      replyToMessageId: "6f9e2d7e-94ae-4f08-9f25-8b0b1db4e7a1",
    });

    expect(response.status).toBe(201);
    expect(messageQuery.rpcParams).toMatchObject({
      p_reply_to_message_id: "6f9e2d7e-94ae-4f08-9f25-8b0b1db4e7a1",
    });
  });

  it("stores Anonymous when a sender chooses the anonymous display mode", async () => {
    const roomQuery = queryResult({ event_id: "colombia2026" });
    const passQuery = queryResult([{ pass_type: "business" }]);
    const messageQuery = queryResult(null);
    mockFrom.mockImplementation((table: string) => {
      if (table === "event_chat_rooms") return roomQuery;
      if (table === "passes") return passQuery;
      if (table === "event_chat_messages") return messageQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await post({
      action: "send",
      channel: "room",
      message: "Please keep the room focused.",
      displayNameMode: "anonymous",
    });

    expect(response.status).toBe(201);
    expect(messageQuery.rpcParams).toMatchObject({
      p_sender_display_name: "Anonymous",
    });
  });

  it("reads room messages using the room schema without a direct-message recipient column", async () => {
    const roomQuery = queryResult({ event_id: "colombia2026" });
    const passQuery = queryResult([{ pass_type: "general" }]);
    const presenceQuery = queryResult([]);
    const messageQuery = queryResult([]);
    mockFrom.mockImplementation((table: string) => {
      if (table === "event_chat_rooms") return roomQuery;
      if (table === "passes") return passQuery;
      if (table === "event_chat_presence") return presenceQuery;
      if (table === "event_chat_messages") return messageQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Authorization");
    expect(messageQuery.select).toHaveBeenCalledWith(
      "id,event_id,sender_id,sender_display_name,message,message_type,reply_to_message_id,created_at",
    );
  });

  it("uses the authenticated profile metadata when a legacy user profile row is missing", async () => {
    const roomQuery = queryResult({ event_id: "colombia2026" });
    const passQuery = queryResult([{ pass_type: "business" }]);
    const presenceQuery = queryResult([]);
    const messageQuery = queryResult([{
      id: "chat-message-1",
      event_id: "colombia2026",
      sender_id: userId,
      sender_display_name: null,
      message: "hello",
      message_type: "text",
      reply_to_message_id: null,
      created_at: "2026-08-13T23:19:00.000Z",
    }]);
    const profileQuery = queryResult([]);
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          id: userId,
          email: "ecalderon@unal.edu.co",
          user_metadata: { full_name: "Edward Calderon", picture: "https://example.com/edward.png" },
        },
      },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "event_chat_rooms") return roomQuery;
      if (table === "passes") return passQuery;
      if (table === "event_chat_presence") return presenceQuery;
      if (table === "event_chat_messages") return messageQuery;
      if (table === "user_profiles") return profileQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await get();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.viewerId).toBe(userId);
    expect(payload.data.messages[0]).toMatchObject({
      sender_name: "Edward Calderon",
      sender_avatar_url: "https://example.com/edward.png",
    });
  });

  it("records a pass holder heartbeat and returns zero presence when the room is empty", async () => {
    const roomQuery = queryResult({ event_id: "colombia2026" });
    const passQuery = queryResult([{ pass_type: "general" }]);
    const presenceQuery = queryResult([]);
    mockFrom.mockImplementation((table: string) => {
      if (table === "event_chat_rooms") return roomQuery;
      if (table === "passes") return passQuery;
      if (table === "event_chat_presence") return presenceQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { POST } = require("../../app/api/events/[eventId]/chat+api");
    const response = await POST(
      new Request("https://api.hashpass.tech/api/events/colombia2026/chat", {
        method: "POST",
        body: JSON.stringify({ action: "presence", channel: "presence" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(presenceQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: "colombia2026", user_id: userId }),
      { onConflict: "event_id,user_id" },
    );
    expect(await response.json()).toMatchObject({
      data: { eventId: "colombia2026", presence: { peopleCount: 0, avatarUrls: [] } },
    });
  });

  it("rejects legacy aliases instead of remapping them to another event room", async () => {
    const response = await get("bsl");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "A valid event id is required" });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("fails closed when the canonical event room is not registered", async () => {
    const roomQuery = queryResult(null);
    mockFrom.mockImplementation((table: string) => {
      if (table === "event_chat_rooms") return roomQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await get();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "This event room is unavailable" });
  });
});
