export type EventChatChannel = "room" | "vip" | "direct" | "members";

export type EventChatRoomChannel = "global" | "vip";

export type EventChatReactionType =
  | "like"
  | "celebrate"
  | "support"
  | "love"
  | "insightful"
  | "funny";

export type EventChatReactionSummary = {
  counts: Partial<Record<EventChatReactionType, number>>;
  viewerReaction: EventChatReactionType | null;
  /** Display names grouped by reaction type for the reaction details popover. */
  users?: Partial<Record<EventChatReactionType, string[]>>;
};

export type EventChatReactionRow = {
  user_id: string;
  reaction_type: EventChatReactionType;
};
