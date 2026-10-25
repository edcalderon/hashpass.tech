import type { EventChatReactionType } from "../lib/event-chat";

export type EventRoomReactionFilter = EventChatReactionType | "all";

export type EventRoomReactionModalSelection = {
  messageId: string;
  reactionType: EventRoomReactionFilter;
};
