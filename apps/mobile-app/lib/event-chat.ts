import { apiClient } from "./api-client";
import type { EventChatPassType, EventChatPermissions } from "./event-chat-permissions";

export type EventChatChannel = "room" | "direct" | "members";

export type EventChatMessage = {
  id: string;
  event_id: string;
  sender_id: string;
  recipient_id?: string | null;
  sender_name?: string;
  sender_avatar_url?: string | null;
  message: string;
  message_type: "text" | "emoji";
  created_at: string;
};

export type EventChatPresence = {
  peopleCount: number;
  avatarUrls: Array<string | null>;
};

export const getEventChatAvatarUrl = ({
  senderId,
  senderName,
  senderAvatarUrl,
  isAnonymous = false,
}: {
  senderId?: string | null;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  isAnonymous?: boolean;
}): string => {
  const seed = encodeURIComponent(senderId || senderName || "hashpass-member");
  if (isAnonymous) {
    return "https://api.dicebear.com/9.x/bottts/png?size=64&seed=anonymous-" + seed;
  }
  if (senderAvatarUrl?.trim()) return senderAvatarUrl.trim();
  return "https://api.dicebear.com/9.x/avataaars/png?size=64&seed=" + seed;
};

export type EventChatMember = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  passType: EventChatPassType;
};

type EventChatError = Error & { status?: number };

export const isEventChatAccessDenied = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" && (error as { status?: number }).status === 403);

export const getEventChatAccessCopy = (isPastEvent: boolean) =>
  isPastEvent
    ? {
        title: "This room is for event attendees",
        body: "This pass-only event has ended. Only verified attendees with an active event pass can access its meeting chats.",
        actionLabel: null,
      }
    : {
        title: "You can't enter this event room",
        body: "You need an active pass for this event. Buy a ticket to join the room and access its meeting chats.",
      actionLabel: "Buy a ticket",
    };

export const getEventChatUpgradeUrl = (
  eventId: string,
  passType: "business" | "vip",
): string =>
  "https://blockchainsummit.la/" + encodeURIComponent(eventId) + "/?upgrade=" + passType;

export const isEventChatPastEvent = (
  event: { eventStartDate?: string; eventEndDate?: string; tourRole?: string },
  now: number = Date.now(),
): boolean => {
  if (event.tourRole === "archive") return true;
  const end = event.eventEndDate ? Date.parse(event.eventEndDate) : NaN;
  return Number.isFinite(end) && end < now;
};

type EventChatResponse = {
  eventId: string;
  viewerId: string;
  passType: EventChatPassType;
  permissions: EventChatPermissions;
  messages: EventChatMessage[];
  presence?: EventChatPresence;
};

const endpoint = (eventId: string) =>
  `/events/${encodeURIComponent(eventId)}/chat`;

const unwrap = <T>(payload: unknown): T | null => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return ((payload as { data?: T }).data ?? null) as T | null;
  }
  return (payload as T | null) ?? null;
};

const requestOptions = { skipEventSegment: true } as const;

export async function loadEventChat(
  eventId: string,
  channel: Exclude<EventChatChannel, "members"> = "room",
  recipientId?: string,
) {
  const response = await apiClient.get(endpoint(eventId), {
    ...requestOptions,
    params: { channel, recipientId },
  });
  if (!response.success) {
    const error = new Error(response.error) as EventChatError;
    error.status = response.status;
    throw error;
  }
  const data = unwrap<EventChatResponse>(response.data);
  if (!data) throw new Error("The event chat returned an empty response");
  return data;
}

export async function loadEventChatMembers(eventId: string) {
  const response = await apiClient.get(endpoint(eventId), {
    ...requestOptions,
    params: { channel: "members" },
  });
  if (!response.success) {
    const error = new Error(response.error) as EventChatError;
    error.status = response.status;
    throw error;
  }
  return unwrap<{ members: EventChatMember[] }>(response.data)?.members || [];
}

export async function heartbeatEventChatPresence(eventId: string) {
  const response = await apiClient.post(
    endpoint(eventId),
    { action: "presence", channel: "presence" },
    requestOptions,
  );
  if (!response.success) {
    const error = new Error(response.error) as EventChatError;
    error.status = response.status;
    throw error;
  }
  return unwrap<{ eventId: string; presence: EventChatPresence }>(response.data)?.presence || {
    peopleCount: 0,
    avatarUrls: [],
  };
}

export async function loadEventChatPresence(eventId: string) {
  const response = await apiClient.get(endpoint(eventId), {
    ...requestOptions,
    params: { channel: "presence" },
  });
  if (!response.success) {
    const error = new Error(response.error) as EventChatError;
    error.status = response.status;
    throw error;
  }
  return unwrap<{ eventId: string; presence: EventChatPresence }>(response.data)?.presence || {
    peopleCount: 0,
    avatarUrls: [],
  };
}

export async function sendEventChatMessage(input: {
  eventId: string;
  message: string;
  messageType?: "text" | "emoji";
  recipientId?: string;
  displayNameMode?: "profile" | "anonymous";
}) {
  const response = await apiClient.post(
    endpoint(input.eventId),
    {
      action: "send",
      channel: input.recipientId ? "direct" : "room",
      message: input.message,
      messageType: input.messageType || "text",
      recipientId: input.recipientId,
      displayNameMode: input.displayNameMode || "profile",
    },
    requestOptions,
  );
  if (!response.success) {
    const error = new Error(response.error) as EventChatError;
    error.status = response.status;
    throw error;
  }
  return unwrap<{ id: string }>(response.data);
}
