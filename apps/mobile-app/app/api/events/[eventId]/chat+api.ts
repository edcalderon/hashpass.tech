import { getEventChatPermissions, type EventChatPassType } from "@/lib/event-chat-permissions";
import type { EventChatReactionType, EventChatRoomChannel } from "@/lib/event-chat";
import type { EventChatReactionRow } from "@/types/EventChat.types";
import { eventIdFromRequest } from "@/lib/server/event-api";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

// Chat URLs must use the canonical event identity. Aliases used by older
// explorer routes are intentionally rejected here so one event can never be
// reached through another event's link.
const SUPPORTED_EVENTS = new Set(["bsl2025", "peru2026", "chile2026", "colombia2026", "cbweek2026"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_MESSAGES = 100;
const ROOM_MESSAGE_LIMIT = 5;
const CHAT_REACTION_TYPES = ["like", "celebrate", "support", "love", "insightful", "funny"] as const;
const CHAT_ROOM_CHANNELS = ["global", "vip"] as const;
const ROOM_MESSAGE_COLUMNS = "id,event_id,sender_id,sender_display_name,message,message_type,reply_to_message_id,created_at";
const DIRECT_MESSAGE_COLUMNS = `${ROOM_MESSAGE_COLUMNS},recipient_id`;
const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
  Vary: "Authorization",
};

type ChatMessageRow = {
  id: string;
  event_id: string;
  sender_id: string;
  recipient_id?: string | null;
  sender_display_name?: string | null;
  sender_avatar_url?: string | null;
  message: string;
  message_type: "text" | "emoji";
  reply_to_message_id?: string | null;
  created_at: string;
};

type AuthUserProfile = {
  id: string;
  email?: string | null;
  user_metadata?: {
    name?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    picture?: string | null;
  } | null;
};

type SenderIdentity = {
  name: string;
  avatarUrl: string | null;
};

type PublicChatMessage = Omit<ChatMessageRow, "sender_id"> & {
  sender_id: string | null;
  sender_name: string;
  sender_avatar_url: string | null;
  is_anonymous: boolean;
  is_own_message: boolean;
  reactions?: {
    counts: Partial<Record<EventChatReactionType, number>>;
    viewerReaction: EventChatReactionType | null;
    users?: Partial<Record<EventChatReactionType, string[]>>;
  };
};

type ChatPresence = {
  peopleCount: number;
  avatarUrls: Array<string | null>;
};

type RoomRateLimit = {
  limit: number;
  consecutiveMessages: number;
  waitingForReply: boolean;
};

const isChatRoomChannel = (value: unknown): value is EventChatRoomChannel =>
  typeof value === "string" && CHAT_ROOM_CHANNELS.includes(value as EventChatRoomChannel);

const roomChannelForChatChannel = (channel: string): EventChatRoomChannel =>
  channel === "vip" ? "vip" : "global";

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: PRIVATE_HEADERS });

const validMessage = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= MAX_MESSAGE_LENGTH;

const getRoomRateLimit = (messages: Array<Pick<ChatMessageRow, "sender_id">>, userId: string): RoomRateLimit => {
  let consecutiveMessages = 0;
  for (const message of [...messages].reverse()) {
    if (message.sender_id !== userId) break;
    consecutiveMessages += 1;
  }
  return {
    limit: ROOM_MESSAGE_LIMIT,
    consecutiveMessages,
    waitingForReply: consecutiveMessages >= ROOM_MESSAGE_LIMIT,
  };
};

const isChatRateLimitError = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" &&
    ((error as { code?: string }).code === "P0001" ||
      (error as { details?: string }).details === "CHAT_RATE_LIMIT"));

const isMissingReactionTableError = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      ((error as { code?: string }).code === "42P01" ||
        /event_chat(?:_direct)?_message_reactions/i.test(
          String((error as { message?: string }).message || ""),
        )),
  );

async function resolveReactionUserNames(
  supabase: any,
  userIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds)];
  const names = new Map<string, string>();
  if (!uniqueIds.length) return names;

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id,full_name")
    .in("user_id", uniqueIds);
  if (!profileError) {
    for (const profile of (profiles || []) as { user_id: string; full_name?: string | null }[]) {
      const name = profile.full_name?.trim();
      if (name) names.set(profile.user_id, name);
    }
  }

  const missingIds = uniqueIds.filter((userId) => !names.has(userId));
  if (missingIds.length && supabase.auth?.admin?.getUserById) {
    const authProfiles = await Promise.all(
      missingIds.map(async (userId: string) => {
        const result = await supabase.auth.admin.getUserById(userId);
        const user = result?.data?.user as AuthUserProfile | undefined;
        if (!user) return null;
        const metadata = user.user_metadata || {};
        return [
          userId,
          metadata.full_name?.trim() ||
            metadata.name?.trim() ||
            user.email?.split("@")[0]?.trim() ||
            "HASHPASS member",
        ] as const;
      }),
    );
    for (const profile of authProfiles) {
      if (profile) names.set(profile[0], profile[1]);
    }
  }

  return names;
}

async function authenticatedUser(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return { response: jsonError(identity.error, identity.status) };
  if (!identity.supabaseUserId || !UUID_PATTERN.test(identity.supabaseUserId)) {
    return { response: jsonError("A linked pass identity is required", 403) };
  }
  return { userId: identity.supabaseUserId };
}

const getEventId = (request: Request): string | null => {
  const eventId = eventIdFromRequest(request);
  return eventId && SUPPORTED_EVENTS.has(eventId) ? eventId : null;
};

async function requireEventRoom(supabase: any, eventId: string) {
  const { data, error } = await supabase
    .from("event_chat_rooms")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { response: jsonError("This event room is unavailable", 404) };
  return { eventId: data.event_id as string };
}

async function getPassType(supabase: any, userId: string, eventId: string): Promise<EventChatPassType | null> {
  const { data, error } = await supabase
    .from("passes")
    .select("pass_type")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;

  const passType = Array.isArray(data) ? data[0]?.pass_type : data?.pass_type;
  return passType === "general" || passType === "business" || passType === "vip"
    ? passType
    : null;
}

async function requirePass(supabase: any, userId: string, eventId: string) {
  const passType = await getPassType(supabase, userId, eventId);
  if (!passType) return { response: jsonError("An active pass is required for this event room", 403) };
  return { passType, permissions: getEventChatPermissions(passType) };
}

async function isValidDirectReplyTarget(
  supabase: any,
  eventId: string,
  senderId: string,
  recipientId: string,
  replyToMessageId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("event_chat_direct_messages")
    .select("id,sender_id,recipient_id,event_id")
    .eq("id", replyToMessageId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const participants = new Set([senderId, recipientId]);
  return participants.has(data.sender_id) && participants.has(data.recipient_id);
}

async function getRoomPresence(
  supabase: any,
  eventId: string,
  roomChannel: EventChatRoomChannel = "global",
): Promise<ChatPresence> {
  const activeSince = new Date(Date.now() - 90_000).toISOString();
  const { data: rows, error } = await supabase
    .from("event_chat_presence")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("room_channel", roomChannel)
    .gt("last_seen_at", activeSince);
  if (error) throw error;

  const userIds: string[] = Array.from(new Set(
    (rows || []).map((row: { user_id: string }) => row.user_id),
  ));
  if (!userIds.length) return { peopleCount: 0, avatarUrls: [] };

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id,avatar_url")
    .in("user_id", userIds);
  if (profileError) throw profileError;

  const avatars = new Map<string, string | null>(
    (profiles || []).map((profile: { user_id: string; avatar_url?: string | null }) => [
      profile.user_id,
      profile.avatar_url?.trim() || null,
    ]),
  );
  return {
    peopleCount: userIds.length,
    avatarUrls: userIds.slice(0, 3).map((userId) => avatars.get(userId) || null),
  };
}

async function addSenderNames(supabase: any, messages: ChatMessageRow[], viewerId: string): Promise<PublicChatMessage[]> {
  const senderIds: string[] = Array.from(new Set(messages.map((message) => message.sender_id)));
  if (!senderIds.length) return messages as PublicChatMessage[];

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,full_name,avatar_url")
    .in("user_id", senderIds);
  if (error) throw error;
  const names = new Map<string, SenderIdentity>(
    (data || []).map((profile: { user_id: string; full_name?: string | null; avatar_url?: string | null }) => [
      profile.user_id,
      {
        name: profile.full_name?.trim() || "HASHPASS member",
        avatarUrl: profile.avatar_url?.trim() || null,
      },
    ]),
  );
  const missingProfileIds = senderIds.filter((senderId) => {
    const profile = names.get(senderId);
    return !profile?.name || profile.name === "HASHPASS member";
  });
  if (missingProfileIds.length && supabase.auth?.admin?.getUserById) {
    const authProfiles = await Promise.all(
      missingProfileIds.map(async (senderId: string) => {
        const result = await supabase.auth.admin.getUserById(senderId);
        const user = result?.data?.user as AuthUserProfile | undefined;
        if (!user) return null;
        const metadata = user.user_metadata || {};
        const emailName = user.email?.split("@")[0]?.trim();
        return [
          senderId,
          {
            name: metadata.full_name?.trim() || metadata.name?.trim() || emailName || "HASHPASS member",
            avatarUrl: metadata.avatar_url?.trim() || metadata.picture?.trim() || null,
          },
        ] as const;
      }),
    );
    for (const profile of authProfiles) {
      if (profile) names.set(profile[0], profile[1]);
    }
  }
  return messages.map((message) => {
    const isAnonymous = message.sender_display_name?.trim() === "Anonymous";
    return {
      ...message,
      // Never expose a stable account identifier for anonymous messages.
      // is_own_message lets the viewer align their own message without
      // giving them a value that can be resolved through the members API.
      sender_id: isAnonymous ? null : message.sender_id,
      sender_name: isAnonymous ? "Anonymous" : names.get(message.sender_id)?.name || "HASHPASS member",
      sender_avatar_url: isAnonymous ? null : names.get(message.sender_id)?.avatarUrl || null,
      is_anonymous: isAnonymous,
      is_own_message: message.sender_id === viewerId,
    };
  });
}

async function addReactionSummaries(
  supabase: any,
  messages: PublicChatMessage[],
  viewerId: string,
  channel: "room" | "vip" | "direct",
): Promise<PublicChatMessage[]> {
  if (!messages.length) return messages;
  const reactionTable = channel === "direct"
    ? "event_chat_direct_message_reactions"
    : "event_chat_message_reactions";
  const messageIds = messages.map((message) => message.id);
  const { data, error } = await supabase
    .from(reactionTable)
    .select("message_id,user_id,reaction_type")
    .eq("event_id", messages[0].event_id)
    .in("message_id", messageIds);
  if (error) {
    // Reactions are additive and the migration may be rolling out after the
    // chat endpoint. Keep existing chat readable while the table is absent.
    if (isMissingReactionTableError(error)) {
      return messages.map((message) => ({
        ...message,
        reactions: { counts: {}, viewerReaction: null, users: {} },
      }));
    }
    throw error;
  }

  const grouped = new Map<string, EventChatReactionRow[]>();
  const reactionRows = (data || []) as (EventChatReactionRow & { message_id: string })[];
  for (const row of reactionRows) {
    if (!CHAT_REACTION_TYPES.includes(row.reaction_type)) continue;
    const reactions = grouped.get(row.message_id) || [];
    reactions.push(row);
    grouped.set(row.message_id, reactions);
  }
  const names = await resolveReactionUserNames(
    supabase,
    reactionRows.map((row) => row.user_id),
  );
  return messages.map((message) => {
    const reactions = grouped.get(message.id) || [];
    const counts: Partial<Record<EventChatReactionType, number>> = {};
    const users: Partial<Record<EventChatReactionType, string[]>> = {};
    for (const reaction of reactions) {
      counts[reaction.reaction_type] = (counts[reaction.reaction_type] || 0) + 1;
      const reactionUsers = users[reaction.reaction_type] || [];
      reactionUsers.push(names.get(reaction.user_id) || "HASHPASS member");
      users[reaction.reaction_type] = reactionUsers;
    }
    return {
      ...message,
      reactions: {
        counts,
        viewerReaction: reactions.find((reaction) => reaction.user_id === viewerId)?.reaction_type || null,
        users,
      },
    };
  });
}

async function getReactionSummary(
  supabase: any,
  reactionTable: "event_chat_message_reactions" | "event_chat_direct_message_reactions",
  eventId: string,
  messageId: string,
  viewerId: string,
) {
  const { data, error } = await supabase
    .from(reactionTable)
    .select("user_id,reaction_type")
    .eq("event_id", eventId)
    .eq("message_id", messageId);
  if (error) throw error;
  const reactionRows = (data || []) as EventChatReactionRow[];
  const names = await resolveReactionUserNames(
    supabase,
    reactionRows.map((row) => row.user_id),
  );
  const counts: Partial<Record<EventChatReactionType, number>> = {};
  const users: Partial<Record<EventChatReactionType, string[]>> = {};
  let viewerReaction: EventChatReactionType | null = null;
  for (const row of reactionRows) {
    if (!CHAT_REACTION_TYPES.includes(row.reaction_type)) continue;
    counts[row.reaction_type] = (counts[row.reaction_type] || 0) + 1;
    const reactionUsers = users[row.reaction_type] || [];
    reactionUsers.push(names.get(row.user_id) || "HASHPASS member");
    users[row.reaction_type] = reactionUsers;
    if (row.user_id === viewerId) viewerReaction = row.reaction_type;
  }
  return { counts, viewerReaction, users };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const readOnly = url.searchParams.get("mode") === "read";
  const auth = readOnly ? { userId: null as string | null } : await authenticatedUser(request);
  if ("response" in auth) return auth.response;
  const eventId = getEventId(request);
  if (!eventId) return jsonError("A valid event id is required", 400);

  const supabase = getSupabaseServerForRequest(request);
  const channel = url.searchParams.get("channel") || "room";
  if (channel !== "room" && channel !== "vip" && channel !== "direct" && channel !== "members" && channel !== "presence") {
    return jsonError("Unsupported chat channel", 400);
  }
  if (readOnly && channel !== "room") {
    return jsonError("Anonymous visitors can only read the global room", 403);
  }
  try {
    const room = await requireEventRoom(supabase, eventId);
    if ("response" in room) {
      const response = room.response;
      // Presence is an optional enhancement for event cards. An event can be
      // published before its chat room migration runs; return an empty
      // presence envelope instead of a noisy 404 every polling interval.
      if (channel === "presence" && response?.status === 404) {
        return Response.json({ data: { eventId, presence: { peopleCount: 0, avatarUrls: [] } } }, { headers: PRIVATE_HEADERS });
      }
      return response || jsonError("This event room is unavailable", 404);
    }
    const access = readOnly
      ? { passType: null as EventChatPassType | null, permissions: getEventChatPermissions(null) }
      : await requirePass(supabase, auth.userId as string, eventId);
    if ("response" in access) return access.response;
    const roomChannel = roomChannelForChatChannel(channel);
    if (channel === "vip" && access.passType !== "vip") {
      return jsonError("A VIP pass is required to enter the VIP room", 403);
    }
    if (channel === "presence") {
      const requestedRoomChannel = url.searchParams.get("roomChannel") || "global";
      if (!isChatRoomChannel(requestedRoomChannel)) return jsonError("Unsupported room channel", 400);
      if (requestedRoomChannel === "vip" && access.passType !== "vip") {
        return jsonError("A VIP pass is required to view VIP room presence", 403);
      }
    }

    const recipientId = channel === "direct"
      ? new URL(request.url).searchParams.get("recipientId")
      : null;
    if (channel === "members" && !access.permissions.canSendDirect) {
      return jsonError("A VIP pass is required for direct messages", 403);
    }
    // A non-VIP attendee may read a direct conversation addressed to them,
    // but only VIPs may browse the member directory or unscoped inbox.
    if (channel === "direct" && !recipientId && !access.permissions.canSendDirect) {
      return jsonError("A VIP pass is required to browse direct messages", 403);
    }

    if (channel === "members") {
      const { data: passes, error: passError } = await supabase
        .from("passes")
        .select("user_id,pass_type")
        .eq("event_id", eventId)
        .eq("status", "active");
      if (passError) throw passError;
      const memberIds: string[] = Array.from(
        new Set((passes || []).map((pass: { user_id: string }) => pass.user_id)),
      );
      const { data: profiles, error: profileError } = memberIds.length
        ? await supabase.from("user_profiles").select("user_id,full_name,avatar_url").in("user_id", memberIds)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const names = new Map<string, SenderIdentity>(
        (profiles || []).map((profile: { user_id: string; full_name?: string | null; avatar_url?: string | null }) => [
          profile.user_id,
          {
            name: profile.full_name?.trim() || "HASHPASS member",
            avatarUrl: profile.avatar_url?.trim() || null,
          },
        ]),
      );
      const missingMemberIds = memberIds.filter((memberId) => !names.get(memberId)?.name || names.get(memberId)?.name === "HASHPASS member");
      if (missingMemberIds.length && supabase.auth?.admin?.getUserById) {
        const authProfiles = await Promise.all(
          missingMemberIds.map(async (memberId: string) => {
            const result = await supabase.auth.admin.getUserById(memberId);
            const user = result?.data?.user as AuthUserProfile | undefined;
            if (!user) return null;
            const metadata = user.user_metadata || {};
            return [
              memberId,
              {
                name: metadata.full_name?.trim() || metadata.name?.trim() || user.email?.split("@")[0]?.trim() || "HASHPASS member",
                avatarUrl: metadata.avatar_url?.trim() || metadata.picture?.trim() || null,
              },
            ] as const;
          }),
        );
        for (const profile of authProfiles) {
          if (profile) names.set(profile[0], profile[1]);
        }
      }
      return Response.json({
        data: {
          eventId,
          members: (passes || []).map((pass: { user_id: string; pass_type: EventChatPassType }) => ({
            userId: pass.user_id,
            name: names.get(pass.user_id)?.name || "HASHPASS member",
            avatarUrl: names.get(pass.user_id)?.avatarUrl || null,
            passType: pass.pass_type,
          })),
        },
      }, { headers: PRIVATE_HEADERS });
    }

    if (channel === "presence") {
      const requestedRoomChannel = (url.searchParams.get("roomChannel") || "global") as EventChatRoomChannel;
      return Response.json({
        data: { eventId, presence: await getRoomPresence(supabase, eventId, requestedRoomChannel) },
      }, { headers: PRIVATE_HEADERS });
    }

    let query = supabase
      .from(channel === "direct" ? "event_chat_direct_messages" : "event_chat_messages")
      .select(channel === "direct" ? DIRECT_MESSAGE_COLUMNS : ROOM_MESSAGE_COLUMNS)
      .eq("event_id", eventId)
      // Limit the newest page, then reverse it before returning so the UI
      // renders chronological messages without dropping recent activity.
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MAX_MESSAGES);
    if (channel === "vip" || channel === "room") {
      query = query.eq("room_channel", roomChannel);
    }
    if (channel === "direct") {
      if (recipientId && !UUID_PATTERN.test(recipientId)) return jsonError("A valid recipient is required", 400);
      if (recipientId) {
        const recipientPassType = await getPassType(supabase, recipientId, eventId);
        if (!recipientPassType) return jsonError("The recipient must hold an active pass for this event", 403);
        query = query.or(
          `and(sender_id.eq.${auth.userId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${auth.userId})`,
        );
      } else {
        query = query.or(`sender_id.eq.${auth.userId},recipient_id.eq.${auth.userId}`);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    const newestMessages = [...((data || []) as ChatMessageRow[])].reverse();
    const publicMessages = await addSenderNames(supabase, newestMessages, auth.userId || "");
    const readOnlyMessages = readOnly
      ? publicMessages.map((message) => ({
          ...message,
          // A guest can read conversation context, but never receives stable
          // account identifiers, avatars, reaction-user names, or a viewer
          // identity that could be used to mutate the room later.
          sender_id: null,
          sender_avatar_url: null,
          is_own_message: false,
        }))
      : publicMessages;
    const messagesWithReactions = await addReactionSummaries(
      supabase,
      readOnlyMessages,
      auth.userId || "",
      channel,
    );
    const safeMessages = readOnlyMessages.map((message, index) => ({
      ...messagesWithReactions[index],
      reactions: readOnly
        ? {
            counts: messagesWithReactions[index]?.reactions?.counts || {},
            viewerReaction: null,
          }
        : messagesWithReactions[index]?.reactions,
    }));
    return Response.json({
      data: {
        eventId,
        viewerId: auth.userId,
        passType: access.passType,
        permissions: access.permissions,
        presence: await getRoomPresence(supabase, eventId, roomChannel),
        messages: safeMessages,
        roomRateLimit: !readOnly && (channel === "room" || channel === "vip")
          ? getRoomRateLimit(newestMessages, auth.userId)
          : null,
      },
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("[event-chat] fetch error:", error);
    return jsonError("Failed to load event chat", 500);
  }
}

export async function POST(request: Request) {
  const auth = await authenticatedUser(request);
  if ("response" in auth) return auth.response;
  const eventId = getEventId(request);
  if (!eventId) return jsonError("A valid event id is required", 400);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const channel = body?.channel || "room";
  if (body?.action === "presence") {
    if (channel !== "presence") return jsonError("Unsupported presence channel", 400);
    const roomChannel = body?.roomChannel || "global";
    if (!isChatRoomChannel(roomChannel)) return jsonError("Unsupported room channel", 400);
    const supabase = getSupabaseServerForRequest(request);
    try {
      const room = await requireEventRoom(supabase, eventId);
      if ("response" in room) {
        const response = room.response;
        if (response?.status === 404) {
          return Response.json({ data: { eventId, presence: { peopleCount: 0, avatarUrls: [] } } }, { headers: PRIVATE_HEADERS });
        }
        return response || jsonError("This event room is unavailable", 404);
      }
      const access = await requirePass(supabase, auth.userId, eventId);
      if ("response" in access) return access.response;
      if (roomChannel === "vip" && access.passType !== "vip") {
        return jsonError("A VIP pass is required to view VIP room presence", 403);
      }
      const { error } = await supabase.from("event_chat_presence").upsert(
        {
          event_id: eventId,
          user_id: auth.userId,
          room_channel: roomChannel,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "event_id,room_channel,user_id" },
      );
      if (error) throw error;
      return Response.json({
        data: { eventId, presence: await getRoomPresence(supabase, eventId, roomChannel) },
      }, { headers: PRIVATE_HEADERS });
    } catch (error) {
      console.error("[event-chat] presence error:", error);
      return jsonError("Failed to update event room presence", 500);
    }
  }
  if (body?.action === "react") {
    if (channel !== "room" && channel !== "vip" && channel !== "direct") {
      return jsonError("Unsupported reaction channel", 400);
    }
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    if (!UUID_PATTERN.test(messageId)) return jsonError("A valid message is required", 400);
    const reactionType = body.reactionType == null ? null : body.reactionType;
    if (reactionType !== null &&
        (typeof reactionType !== "string" || !CHAT_REACTION_TYPES.includes(reactionType as EventChatReactionType))) {
      return jsonError("Unsupported reaction type", 400);
    }

    const supabase = getSupabaseServerForRequest(request);
    try {
      const room = await requireEventRoom(supabase, eventId);
      if ("response" in room) return room.response;
      const access = await requirePass(supabase, auth.userId, eventId);
      if ("response" in access) return access.response;
      if (channel === "vip" && access.passType !== "vip") {
        return jsonError("A VIP pass is required to react in the VIP room", 403);
      }

      const messageTable = channel === "direct" ? "event_chat_direct_messages" : "event_chat_messages";
      const reactionTable = channel === "direct"
        ? "event_chat_direct_message_reactions"
        : "event_chat_message_reactions";
      let messageQuery = supabase
        .from(messageTable)
        .select(channel === "direct" ? "id,event_id,sender_id,recipient_id" : "id,event_id")
        .eq("id", messageId)
        .eq("event_id", eventId);
      if (channel !== "direct") {
        messageQuery = messageQuery.eq("room_channel", roomChannelForChatChannel(channel));
      }
      const { data: message, error: messageError } = await messageQuery.maybeSingle();
      if (messageError) throw messageError;
      if (!message) return jsonError("The message is no longer available", 404);
      if (channel === "direct" && message.sender_id !== auth.userId && message.recipient_id !== auth.userId) {
        return jsonError("You cannot react to this direct message", 403);
      }

      if (reactionType === null) {
        const { error } = await supabase
          .from(reactionTable)
          .delete()
          .eq("event_id", eventId)
          .eq("message_id", messageId)
          .eq("user_id", auth.userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(reactionTable)
          .upsert(
            {
              event_id: eventId,
              message_id: messageId,
              user_id: auth.userId,
              reaction_type: reactionType,
            },
            { onConflict: "message_id,user_id" },
          );
        if (error) throw error;
      }

      return Response.json({
        data: {
          messageId,
          reaction: await getReactionSummary(supabase, reactionTable, eventId, messageId, auth.userId),
        },
      }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (isMissingReactionTableError(error)) {
      return jsonError("Reactions are still being enabled for this room", 503);
    }
    console.error("[event-chat] reaction error:", error);
    return jsonError("Failed to update message reaction", 500);
  }
  }
  if (body?.action !== "send" || !validMessage(body.message)) {
    return jsonError("A non-empty message and supported send action are required", 400);
  }
  const messageType = body.messageType === "emoji" ? "emoji" : "text";
  if (channel !== "room" && channel !== "vip" && channel !== "direct") return jsonError("Unsupported chat channel", 400);
  const replyToMessageId = body.replyToMessageId == null ? null : body.replyToMessageId;
  if (replyToMessageId !== null &&
      (typeof replyToMessageId !== "string" || !UUID_PATTERN.test(replyToMessageId))) {
    return jsonError("A valid message reply target is required", 400);
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const room = await requireEventRoom(supabase, eventId);
    if ("response" in room) return room.response;
    const access = await requirePass(supabase, auth.userId, eventId);
    if ("response" in access) return access.response;
    if (channel === "room" && !access.permissions.canSendRoom) {
      return jsonError("A business or VIP pass is required to send room messages", 403);
    }
    if (channel === "vip" && access.passType !== "vip") {
      return jsonError("A VIP pass is required to send messages in the VIP room", 403);
    }

    let table = "event_chat_messages";
    const payload: Record<string, unknown> = {
      event_id: eventId,
      sender_id: auth.userId,
      message: body.message.trim(),
      message_type: messageType,
      reply_to_message_id: replyToMessageId,
    };
    if (body.displayNameMode === "anonymous") {
      payload.sender_display_name = "Anonymous";
    }
    if (channel === "direct") {
      if (!access.permissions.canSendDirect) return jsonError("A VIP pass is required for direct messages", 403);
      const recipientId = typeof body.recipientId === "string" ? body.recipientId : "";
      if (!UUID_PATTERN.test(recipientId) || recipientId === auth.userId) {
        return jsonError("A valid recipient is required", 400);
      }
      const recipientPassType = await getPassType(supabase, recipientId, eventId);
      if (!recipientPassType) {
        return jsonError("The recipient must hold an active pass for this event", 403);
      }
      if (replyToMessageId && !(await isValidDirectReplyTarget(
        supabase,
        eventId,
        auth.userId,
        recipientId,
        replyToMessageId,
      ))) {
        return jsonError("The reply target is not part of this direct conversation", 400);
      }
      table = "event_chat_direct_messages";
      payload.recipient_id = recipientId;
    }

    const result = channel === "room" || channel === "vip"
      ? await supabase.rpc("send_event_chat_room_message", {
        p_event_id: eventId,
        p_sender_id: auth.userId,
        p_message: body.message.trim(),
        p_message_type: messageType,
        p_sender_display_name: body.displayNameMode === "anonymous" ? "Anonymous" : null,
        p_reply_to_message_id: replyToMessageId,
        ...(channel === "vip" ? { p_room_channel: "vip" } : {}),
      }).single()
      : await supabase
        .from(table)
        .insert(payload)
        .select(DIRECT_MESSAGE_COLUMNS)
        .single();
    const { data, error } = result;
    if (error) throw error;
    const [publicMessage] = data && typeof data === "object" && "sender_id" in data
      ? await addSenderNames(supabase, [data as ChatMessageRow], auth.userId)
      : [data];
    return Response.json({ data: publicMessage }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    if (isChatRateLimitError(error)) {
      return Response.json({
        error: "A reply from another attendee is required before you can send another message",
        code: "CHAT_RATE_LIMIT",
      }, { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": "0" } });
    }
    console.error("[event-chat] send error:", error);
    return jsonError("Failed to send event chat message", 500);
  }
}
