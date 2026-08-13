export type EventChatPassType = "general" | "business" | "vip";

export type EventChatPermissions = {
  canReadRoom: boolean;
  canSendRoom: boolean;
  canSendDirect: boolean;
};

export const getEventChatPermissions = (
  passType: EventChatPassType | null | undefined,
): EventChatPermissions => ({
  canReadRoom: passType === "general" || passType === "business" || passType === "vip",
  canSendRoom: passType === "business" || passType === "vip",
  canSendDirect: passType === "vip",
});
