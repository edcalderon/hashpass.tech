/// <reference types="jest" />

import { EVENT_CHAT_REALTIME_TABLES } from "../../lib/event-chat-realtime";

describe("event chat realtime subscriptions", () => {
  it("listens for room and direct-message inserts without reading rows directly", () => {
    expect(EVENT_CHAT_REALTIME_TABLES).toEqual([
      "event_chat_messages",
      "event_chat_direct_messages",
    ]);
  });
});
