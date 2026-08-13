/// <reference types="jest" />

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock("../../lib/api-client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

describe("event chat client", () => {
  beforeEach(() => {
    jest.resetModules();
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("unwraps the backend data envelope when loading a room", async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        data: {
          eventId: "colombia2026",
          passType: "general",
          permissions: { canReadRoom: true, canSendRoom: false, canSendDirect: false },
          messages: [],
        },
      },
    });

    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { loadEventChat } = require("../../lib/event-chat");
    await expect(loadEventChat("colombia2026")).resolves.toMatchObject({
      eventId: "colombia2026",
      passType: "general",
    });
    expect(mockGet).toHaveBeenCalledWith(
      "/events/colombia2026/chat",
      expect.objectContaining({
        skipEventSegment: true,
        params: { channel: "room", recipientId: undefined },
      }),
    );
  });

  it("sends direct messages through the backend endpoint", async () => {
    mockPost.mockResolvedValue({ success: true, data: { data: { id: "message-1" } } });

    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { sendEventChatMessage } = require("../../lib/event-chat");
    await sendEventChatMessage({
      eventId: "colombia2026",
      recipientId: "c1c4f770-7ad6-4f8c-96c4-5b7e6e2ee2ef",
      message: "hello",
      replyToMessageId: "6f9e2d7e-94ae-4f08-9f25-8b0b1db4e7a1",
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/events/colombia2026/chat",
      expect.objectContaining({
        action: "send",
        channel: "direct",
        recipientId: "c1c4f770-7ad6-4f8c-96c4-5b7e6e2ee2ef",
        replyToMessageId: "6f9e2d7e-94ae-4f08-9f25-8b0b1db4e7a1",
      }),
      { skipEventSegment: true },
    );
  });

  it("preserves a forbidden response so the room can stop polling", async () => {
    mockGet.mockResolvedValue({
      success: false,
      error: "An active pass is required for this event room",
      status: 403,
    });

    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { isEventChatAccessDenied, loadEventChat } = require("../../lib/event-chat");
    await expect(loadEventChat("bsl2025")).rejects.toMatchObject({ status: 403 });
    await expect(
      loadEventChat("bsl2025").catch((error: unknown) => isEventChatAccessDenied(error)),
    ).resolves.toBe(true);
  });

  it("explains ticket access for upcoming rooms and attendee access for past rooms", () => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { getEventChatAccessCopy, getEventChatUpgradeUrl, isEventChatPastEvent } = require("../../lib/event-chat");

    expect(getEventChatAccessCopy(false)).toEqual({
      title: "You can't enter this event room",
      body: "You need an active pass for this event. Buy a ticket to join the room and access its meeting chats.",
      actionLabel: "Buy a ticket",
    });
    expect(getEventChatAccessCopy(true)).toEqual({
      title: "This room is for event attendees",
      body: "This pass-only event has ended. Only verified attendees with an active event pass can access its meeting chats.",
      actionLabel: null,
    });
    expect(
      isEventChatPastEvent({ eventEndDate: "2026-08-07T23:59:59Z" }, Date.parse("2026-08-08T00:00:00Z")),
    ).toBe(true);
    expect(getEventChatUpgradeUrl("colombia2026", "vip")).toBe(
      "https://blockchainsummit.la/colombia2026/?upgrade=vip",
    );
  });

  it("uses profile avatars for named messages and deterministic anonymous avatars", () => {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { getEventChatAvatarUrl } = require("../../lib/event-chat");

    expect(getEventChatAvatarUrl({
      senderId: "user-1",
      senderName: "Ada",
      senderAvatarUrl: " https://cdn.example/avatar.png ",
    })).toBe("https://cdn.example/avatar.png");
    expect(getEventChatAvatarUrl({
      senderId: "user-1",
      senderName: "Anonymous",
      isAnonymous: true,
    })).toBe("https://api.dicebear.com/9.x/bottts/png?size=64&seed=anonymous-user-1");
    expect(getEventChatAvatarUrl({ senderId: "user-1" })).toBe(
      "https://api.dicebear.com/9.x/avataaars/png?size=64&seed=user-1",
    );
  });

  it("sends a backend heartbeat for live room presence", async () => {
    mockPost.mockResolvedValue({
      success: true,
      data: { data: { eventId: "colombia2026", presence: { peopleCount: 1, avatarUrls: [null] } } },
    });

    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { heartbeatEventChatPresence } = require("../../lib/event-chat");
    await expect(heartbeatEventChatPresence("colombia2026")).resolves.toEqual({
      peopleCount: 1,
      avatarUrls: [null],
    });
    expect(mockPost).toHaveBeenCalledWith(
      "/events/colombia2026/chat",
      { action: "presence", channel: "presence" },
      { skipEventSegment: true },
    );
  });
});
