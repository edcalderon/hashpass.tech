import type { EventChatReactionType } from "../lib/event-chat";

export type EventRoomReactionFilter = EventChatReactionType | "all";

export type EventRoomReactionOption = {
  type: EventChatReactionType;
  label: string;
  emoji: string;
};

export type EventRoomReactionModalEntry = {
  id: string;
  name: string;
  reactionType: EventChatReactionType;
};

export type EventRoomReactionModalSelection = {
  messageId: string;
  reactionType: EventRoomReactionFilter;
};
