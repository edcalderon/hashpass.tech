import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "../lib/vector-icons";
import { uiTokens } from "@hashpass/ui/tokens";
import { ModalBackdrop, SegmentedTabs, Surface } from "@hashpass/ui/primitives";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../hooks/useAuth";
import { useTranslation } from "../i18n/i18n";
import { useToastHelpers } from "../contexts/ToastContext";
import ProfileAvatar from "./ProfileAvatar";
import {
  EVENT_CHAT_REACTIONS,
  isEventChatAccessDenied,
  getEventChatAccessCopy,
  heartbeatEventChatPresence,
  loadEventChat,
  loadEventChatMembers,
  reactToEventChatMessage,
  sendEventChatMessage,
  type EventChatChannel,
  type EventChatMember,
  type EventChatMessage,
  type EventChatPresence,
} from "../lib/event-chat";
import type { EventChatReactionType } from "../types/EventChat.types";
import {
  CHAT_EMOJI_CATEGORIES,
  type ChatEmojiCategoryId,
} from "../lib/chat-emojis";
import { getEventChatPermissions } from "../lib/event-chat-permissions";
import type {
  EventRoomReactionFilter,
  EventRoomReactionModalSelection,
} from "../types/EventRoomChat.types";

type EventRoomChatProps = {
  eventId: string;
  eventTitle: string;
  isPastEvent?: boolean;
};

const formatMessageTime = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function EventRoomChat({
  eventId,
  eventTitle,
  isPastEvent = false,
}: EventRoomChatProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { isLoggedIn, dbUserId, user } = useAuth();
  const { t: translate } = useTranslation();
  const { showInfo, showError } = useToastHelpers();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [channel, setChannel] =
    useState<Exclude<EventChatChannel, "members">>("room");
  const [messages, setMessages] = useState<EventChatMessage[]>([]);
  const [members, setMembers] = useState<EventChatMember[]>([]);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [passType, setPassType] = useState<
    "general" | "business" | "vip" | null
  >(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState(() =>
    getEventChatPermissions(null),
  );
  const [presence, setPresence] = useState<EventChatPresence>({
    peopleCount: 0,
    avatarUrls: [],
  });
  const [roomRateLimit, setRoomRateLimit] = useState<{
    limit: number;
    consecutiveMessages: number;
    waitingForReply: boolean;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<EventChatMessage | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [reactionDetailsKey, setReactionDetailsKey] = useState<string | null>(null);
  const [reactionModal, setReactionModal] =
    useState<EventRoomReactionModalSelection | null>(null);
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(null);
  const [emojiCategory, setEmojiCategory] =
    useState<ChatEmojiCategoryId>("reactions");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const accessDeniedRef = useRef(false);
  const [entryOpen, setEntryOpen] = useState(true);
  const [entered, setEntered] = useState(false);
  const [displayNameMode, setDisplayNameMode] = useState<
    "profile" | "anonymous"
  >("profile");
  // Anonymous visitors are intentionally read-only.  Do not let a guest
  // session (or an authenticated user who chose the anonymous entry mode)
  // reach any mutation control; the API also enforces this with a public
  // `mode=read` endpoint for guest history.
  const anonymousReadOnly = !isLoggedIn || displayNameMode === "anonymous";

  const profileName =
    user?.user_metadata?.full_name?.trim() ||
    user?.email?.split("@")[0]?.trim() ||
    "HASHPASS member";
  const profileAvatarUrl =
    user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  const selectedMember =
    members.find((member) => member.userId === recipientId) || null;
  const isRoomChannel = channel === "room" || channel === "vip";
  const isVipRoom = channel === "vip";
  const canSend =
    !anonymousReadOnly &&
    (isVipRoom
      ? passType === "vip"
      : channel === "room"
        ? permissions.canSendRoom
        : permissions.canSendDirect) &&
    !(isRoomChannel && roomRateLimit?.waitingForReply);
  const accessCopy = getEventChatAccessCopy(isPastEvent);
  const localizedAccessCopy = {
    ...accessCopy,
    title: translate(
      isPastEvent ? "eventChat.pastTitle" : "eventChat.upcomingTitle",
      accessCopy.title,
    ),
    body: translate(
      isPastEvent ? "eventChat.pastBody" : "eventChat.upcomingBody",
      accessCopy.body,
    ),
    actionLabel: accessCopy.actionLabel
      ? translate("eventChat.buyTicket", accessCopy.actionLabel)
      : null,
  };

  useEffect(() => {
    // A route transition can reuse this component instance. Reset every
    // event-scoped value before the next request so an old room can never be
    // displayed while the new event is being authorized.
    setMessages([]);
    setMembers([]);
    setRecipientId(null);
    setPassType(null);
    setViewerId(null);
    setPermissions(getEventChatPermissions(null));
    setPresence({ peopleCount: 0, avatarUrls: [] });
    setRoomRateLimit(null);
    setReplyTo(null);
    setReactionPickerMessageId(null);
    setReactionDetailsKey(null);
    setReactionModal(null);
    setError(null);
    setAccessDenied(false);
    accessDeniedRef.current = false;
    setChannel("room");
    setEntered(false);
    setEntryOpen(true);
    setDisplayNameMode(isLoggedIn ? "profile" : "anonymous");
  }, [eventId, isLoggedIn]);

  const refreshChat = useCallback(
    async (silent = false) => {
      if (!entered) return;
      if (!silent) {
        accessDeniedRef.current = false;
        setAccessDenied(false);
      }
      if (!silent) setLoading(true);
      try {
        if (isRoomChannel && !anonymousReadOnly) {
          await heartbeatEventChatPresence(
            eventId,
            isVipRoom ? "vip" : "global",
          ).catch(() => null);
        }
        const data = anonymousReadOnly
          ? await loadEventChat(eventId, channel, recipientId || undefined, true)
          : await loadEventChat(eventId, channel, recipientId || undefined);
        setViewerId(data.viewerId);
        setPassType(data.passType);
        setPermissions(data.permissions);
        setPresence(data.presence || { peopleCount: 0, avatarUrls: [] });
        setRoomRateLimit(
          isRoomChannel ? data.roomRateLimit || null : null,
        );
        setMessages(data.messages);
        setError(null);
        setAccessDenied(false);
      } catch (chatError) {
        const denied = isEventChatAccessDenied(chatError);
        accessDeniedRef.current = denied;
        setAccessDenied(denied);
        if (denied) {
          // Never leave messages from the previously selected event on screen
          // after the new event fails its pass check.
          setMessages([]);
          setPassType(null);
          setPermissions(getEventChatPermissions(null));
        }
        setError(
          chatError instanceof Error
            ? chatError.message
            : "Unable to load this event room.",
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [anonymousReadOnly, channel, entered, eventId, isRoomChannel, isVipRoom, recipientId],
  );

  useEffect(() => {
    if (!entered) return;
    const timer = setInterval(() => {
      if (!accessDeniedRef.current) void refreshChat(true);
    }, 7000);
    void refreshChat();
    return () => {
      clearInterval(timer);
    };
  }, [entered, refreshChat]);

  useEffect(() => {
    if (channel !== "direct" || passType !== "vip") return;
    loadEventChatMembers(eventId)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [channel, eventId, passType]);

  const chooseChannel = (nextChannel: Exclude<EventChatChannel, "members">) => {
    if (anonymousReadOnly && nextChannel !== "room") return;
    setChannel(nextChannel);
    accessDeniedRef.current = false;
    setAccessDenied(false);
    setError(null);
    if (nextChannel === "room" || nextChannel === "vip") setRecipientId(null);
    setReplyTo(null);
  };

  const openMessageProfile = (senderId: string | null, senderName: string) => {
    if (!senderId) return;
    if (senderId === (viewerId || dbUserId)) return;
    if (permissions.canSendDirect) {
      setRecipientId(senderId);
      setChannel("direct");
      setError(null);
      return;
    }
    Alert.alert(
      senderName,
      "You can view this attendee in the event room. Upgrade to a VIP pass to start a direct message.",
    );
  };

  const sendMessage = async (
    message: string,
    messageType: "text" | "emoji" = "text",
  ) => {
    const value = message.trim();
    if (!value || sending) return;
    if (!canSend) {
      if (isRoomChannel && roomRateLimit?.waitingForReply) {
        setError(
          translate(
            "eventChat.replyBeforeSending",
            "You have sent {count} messages in a row. Wait for another attendee to reply before sending more.",
            { count: roomRateLimit.consecutiveMessages },
          ),
        );
      }
      return;
    }
    if (channel === "direct" && !recipientId) {
      setError("Choose an attendee before sending a direct message.");
      return;
    }
    setSending(true);
    try {
      await sendEventChatMessage({
        eventId,
        message: value,
        messageType,
        channel: channel === "vip" ? "vip" : channel === "direct" ? "direct" : "room",
        recipientId:
          channel === "direct" ? recipientId || undefined : undefined,
        replyToMessageId: replyTo?.id,
        displayNameMode,
      });
      setDraft("");
      setReplyTo(null);
      setShowEmojiPicker(false);
      await refreshChat(true);
    } catch (sendError) {
      if ((sendError as { status?: number }).status === 429) {
        setRoomRateLimit({
          limit: 5,
          consecutiveMessages: 5,
          waitingForReply: true,
        });
      }
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send this message.",
      );
    } finally {
      setSending(false);
    }
  };

  const openTicketPurchase = (tier?: "business" | "vip") => {
    router.push({
      pathname: "/events/[eventSlug]/tickets",
      params: {
        eventSlug: eventId,
        openTicketModal: "true",
        ...(tier ? { tier } : {}),
      },
    } as any);
  };

  const requestReply = (message: EventChatMessage) => {
    if (anonymousReadOnly) {
      showInfo(
        translate("eventChat.readOnlyTitle", "Read-only guest view"),
        translate(
          "eventChat.readOnlyBody",
          "Sign in with an event pass to react or reply to comments.",
        ),
        {
          label: translate("eventChat.signIn", "Sign in"),
          onPress: () => router.push("/(shared)/auth" as any),
        },
      );
      return;
    }
    if (!canSend) {
      showInfo(
        translate("eventChat.replyUpgradeTitle", "Upgrade required"),
        translate(
          "eventChat.replyUpgradeBody",
          "You can't reply to comments. Please upgrade your ticket to reply.",
        ),
        {
          label: translate("eventChat.viewTickets", "View tickets"),
          onPress: openTicketPurchase,
        },
      );
      return;
    }
    setReplyTo(message);
  };

  const handleReaction = async (
    message: EventChatMessage,
    reactionType: EventChatReactionType,
  ) => {
    if (anonymousReadOnly) {
      showInfo(
        translate("eventChat.readOnlyTitle", "Read-only guest view"),
        translate(
          "eventChat.readOnlyBody",
          "Sign in with an event pass to react or reply to comments.",
        ),
        {
          label: translate("eventChat.signIn", "Sign in"),
          onPress: () => router.push("/(shared)/auth" as any),
        },
      );
      return;
    }
    if (reactingMessageId) return;
    const currentReaction = message.reactions?.viewerReaction || null;
    setReactingMessageId(message.id);
    setReactionPickerMessageId(null);
    try {
      await reactToEventChatMessage({
        eventId,
        messageId: message.id,
        reactionType: currentReaction === reactionType ? null : reactionType,
        channel: channel === "direct" ? "direct" : channel === "vip" ? "vip" : "room",
      });
      await refreshChat(true);
    } catch (reactionError) {
      showError(
        translate("eventChat.reactionFailedTitle", "Reaction unavailable"),
        reactionError instanceof Error
          ? reactionError.message
          : translate("eventChat.reactionFailedBody", "Please try again."),
      );
    } finally {
      setReactingMessageId(null);
    }
  };

  const openReactionModal = (
    messageId: string,
    reactionType: EventRoomReactionFilter,
  ) => {
    setReactionDetailsKey(null);
    setReactionModal({ messageId, reactionType });
  };

  const activeEmojiCategory =
    CHAT_EMOJI_CATEGORIES.find(
      (category: (typeof CHAT_EMOJI_CATEGORIES)[number]) =>
        category.id === emojiCategory,
    ) || CHAT_EMOJI_CATEGORIES[0];

  // Keep replies visually attached to their parent while preserving the
  // chronological order within each thread. Orphaned replies (for example
  // when the parent is outside the current page) remain top-level messages so
  // a partial history never hides conversation content.
  const messageRows = useMemo(() => {
    const messageIds = new Set(messages.map((message) => message.id));
    const childrenByParent = new Map<string, EventChatMessage[]>();
    const roots: EventChatMessage[] = [];
    for (const message of messages) {
      const parentId = message.reply_to_message_id;
      if (parentId && messageIds.has(parentId)) {
        const children = childrenByParent.get(parentId) || [];
        children.push(message);
        childrenByParent.set(parentId, children);
      } else {
        roots.push(message);
      }
    }
    const rows: [EventChatMessage, number][] = [];
    const visited = new Set<string>();
    const visit = (message: EventChatMessage, depth: number) => {
      if (visited.has(message.id)) return;
      visited.add(message.id);
      rows.push([message, Math.min(depth, 3)]);
      for (const child of childrenByParent.get(message.id) || []) {
        visit(child, depth + 1);
      }
    };
    roots.forEach((message) => visit(message, 0));
    // A malformed cycle should not make messages disappear from the room.
    messages.forEach((message) => visit(message, 0));
    return rows;
  }, [messages]);

  const reactionModalMessage = useMemo(
    () =>
      reactionModal
        ? messages.find((message) => message.id === reactionModal.messageId) ||
          null
        : null,
    [messages, reactionModal],
  );
  const reactionModalEntries = useMemo(() => {
    const users = reactionModalMessage?.reactions?.users || {};
    return EVENT_CHAT_REACTIONS.flatMap((reaction) =>
      (users[reaction.type] || []).map((name, index) => ({
        id: `${reaction.type}:${name}:${index}`,
        name,
        reactionType: reaction.type,
      })),
    );
  }, [reactionModalMessage]);
  const reactionModalRows = useMemo(
    () =>
      reactionModal?.reactionType === "all"
        ? reactionModalEntries
        : reactionModalEntries.filter(
            (entry) => entry.reactionType === reactionModal?.reactionType,
          ),
    [reactionModal, reactionModalEntries],
  );
  const reactionModalTotal = useMemo(
    () =>
      EVENT_CHAT_REACTIONS.reduce(
        (total, reaction) =>
        total + (reactionModalMessage?.reactions?.counts?.[reaction.type] || 0),
        0,
      ),
    [reactionModalMessage],
  );

  const closeEntryDrawer = () => {
    setEntryOpen(false);
    router.back();
  };

  return (
    <>
      <Modal
        visible={entryOpen}
        transparent
        animationType="slide"
        onRequestClose={closeEntryDrawer}
      >
        <Pressable
          testID="event-room-entry-backdrop"
          style={styles.entryBackdrop}
          onPress={closeEntryDrawer}
        >
          <View
            style={styles.entrySheet}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.entryHeader}>
              <Text style={styles.entryEyebrow}>EVENT ROOM</Text>
              <Pressable
                style={styles.entryCloseButton}
                onPress={closeEntryDrawer}
                accessibilityRole="button"
                accessibilityLabel="Close event room entry"
                hitSlop={10}
              >
                <MaterialIcons
                  name="close"
                  size={22}
                  color={colors.text.secondary}
                />
              </Pressable>
            </View>
            <Text style={styles.entryTitle}>Before you enter</Text>
            <Text style={styles.entryEventTitle} numberOfLines={2}>
              {eventTitle}
            </Text>

            <Text style={styles.entrySectionTitle}>Room rules</Text>
            <Text style={styles.entryRule}>
              • Be respectful. Debate ideas, not people.
            </Text>
            <Text style={styles.entryRule}>
              • No spam, harassment, scams, or unsolicited promotion.
            </Text>
            <Text style={styles.entryRule}>
              • Keep messages relevant to this event and community.
            </Text>
            <Text style={styles.entryRule}>
              • General pass holders can read only. Business and VIP can send.
            </Text>
            <Text style={styles.entryRule}>
              • VIP direct messages are for active event pass holders.
            </Text>

            <Text style={styles.entrySectionTitle}>Display name</Text>
            <TouchableOpacity
              style={[
                styles.identityOption,
                displayNameMode === "profile" && styles.identityOptionActive,
                !isLoggedIn && styles.identityOptionDisabled,
              ]}
              onPress={() => {
                if (isLoggedIn) setDisplayNameMode("profile");
              }}
              disabled={!isLoggedIn}
              accessibilityRole="radio"
              accessibilityState={{ selected: displayNameMode === "profile" }}
            >
              <View
                style={[
                  styles.identityRadio,
                  displayNameMode === "profile" && styles.identityRadioActive,
                ]}
              />
              <View style={styles.identityCopy}>
                <Text style={styles.identityTitle}>Use my profile name</Text>
                <Text style={styles.identitySubtitle}>
                  {isLoggedIn ? profileName : "Sign in to use your profile"}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.identityOption,
                displayNameMode === "anonymous" && styles.identityOptionActive,
              ]}
              onPress={() => setDisplayNameMode("anonymous")}
              accessibilityRole="radio"
              accessibilityState={{ selected: displayNameMode === "anonymous" }}
            >
              <View
                style={[
                  styles.identityRadio,
                  displayNameMode === "anonymous" && styles.identityRadioActive,
                ]}
              />
              <View style={styles.identityCopy}>
                <Text style={styles.identityTitle}>Enter as Anonymous</Text>
                <Text style={styles.identitySubtitle}>
                  Read the room without reacting or replying.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.enterButton}
              onPress={() => {
                setEntered(true);
                setEntryOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="Enter event room"
            >
              <Text style={styles.enterButtonText}>Enter the room</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={closeEntryDrawer}
              accessibilityRole="button"
            >
              <Text style={styles.cancelEntryText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(reactionModal && reactionModalMessage)}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionModal(null)}
      >
        <ModalBackdrop
          mode={isDark ? "dark" : "light"}
          style={styles.reactionModalBackdrop}
        >
          <Pressable
            style={styles.reactionModalDismissArea}
            onPress={() => setReactionModal(null)}
          >
            <Surface
              mode={isDark ? "dark" : "light"}
              style={styles.reactionModalCard}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.reactionModalHeader}>
                <Text style={styles.reactionModalTitle}>
                  {translate("eventChat.reactions", "Reactions")}
                </Text>
                <Pressable
                  onPress={() => setReactionModal(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close reactions"
                  hitSlop={10}
                >
                  <MaterialIcons
                    name="close"
                    size={24}
                    color={colors.text.secondary}
                  />
                </Pressable>
              </View>

              <SegmentedTabs<EventRoomReactionFilter>
                mode={isDark ? "dark" : "light"}
                value={reactionModal?.reactionType || "all"}
                onChange={(reactionType) =>
                  setReactionModal((current) =>
                    current ? { ...current, reactionType } : current,
                  )
                }
                accessibilityLabel={translate(
                  "eventChat.reactionFilters",
                  "Reaction filters",
                )}
                tabs={[
                  {
                    id: "all",
                    label: translate("eventChat.allReactions", "All"),
                    count: reactionModalTotal,
                  },
                  ...EVENT_CHAT_REACTIONS.filter(
                    (reaction) =>
                      (reactionModalMessage?.reactions?.counts?.[reaction.type] ||
                        0) > 0,
                  ).map((reaction) => ({
                    id: reaction.type,
                    label: reaction.label,
                    count:
                      reactionModalMessage?.reactions?.counts?.[reaction.type] ||
                      0,
                    trailingIcon: (
                      <Text style={styles.reactionModalTabEmoji}>
                        {reaction.emoji}
                      </Text>
                    ),
                  })),
                ]}
              />

              <ScrollView
                style={styles.reactionModalList}
                contentContainerStyle={styles.reactionModalListContent}
                showsVerticalScrollIndicator={false}
              >
                {reactionModalRows.map((entry) => {
                  const reaction = EVENT_CHAT_REACTIONS.find(
                    (candidate) => candidate.type === entry.reactionType,
                  );
                  return (
                    <View key={entry.id} style={styles.reactionModalRow}>
                      <View style={styles.reactionModalAvatar}>
                        <ProfileAvatar
                          uri={null}
                          name={entry.name}
                          isDark={isDark}
                          initialsSize={18}
                        />
                      </View>
                      <View style={styles.reactionModalUserCopy}>
                        <Text style={styles.reactionModalUserName}>
                          {entry.name}
                        </Text>
                        <Text style={styles.reactionModalReaction}>
                          {reaction?.emoji} {reaction?.label}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                {!reactionModalRows.length && (
                  <Text style={styles.reactionModalEmpty}>
                    {translate(
                      "eventChat.noReactions",
                      "No reactions yet",
                    )}
                  </Text>
                )}
              </ScrollView>
            </Surface>
          </Pressable>
        </ModalBackdrop>
      </Modal>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <MaterialIcons
              name="arrow-back"
              size={24}
              color={colors.text.primary}
            />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>EVENT ROOM</Text>
            <Text style={styles.title} numberOfLines={1}>
              {eventTitle}
            </Text>
          </View>
        </View>

        <View style={styles.channelTabs}>
          <TouchableOpacity
            style={[
              styles.channelTab,
              channel === "room" && styles.channelTabActive,
            ]}
            onPress={() => chooseChannel("room")}
            accessibilityRole="tab"
            accessibilityState={{ selected: channel === "room" }}
          >
            <Text
              style={[
                styles.channelTabText,
                channel === "room" && styles.channelTabTextActive,
              ]}
            >
              Global room
            </Text>
          </TouchableOpacity>
          {passType === "vip" && !anonymousReadOnly && (
            <TouchableOpacity
              style={[
                styles.channelTab,
                channel === "vip" && styles.channelTabActive,
              ]}
              onPress={() => chooseChannel("vip")}
              accessibilityRole="tab"
              accessibilityState={{ selected: channel === "vip" }}
              accessibilityLabel={translate("eventChat.vipRoom", "VIP room")}
            >
              <MaterialIcons
                name="star"
                size={14}
                color={channel === "vip" ? "#fff" : colors.primary}
              />
              <Text
                style={[
                  styles.channelTabText,
                  channel === "vip" && styles.channelTabTextActive,
                ]}
              >
                {translate("eventChat.vipRoom", "VIP room")}
              </Text>
            </TouchableOpacity>
          )}
          {permissions.canSendDirect && !anonymousReadOnly && (
            <TouchableOpacity
              style={[
                styles.channelTab,
                channel === "direct" && styles.channelTabActive,
              ]}
              onPress={() => chooseChannel("direct")}
              accessibilityRole="tab"
              accessibilityState={{ selected: channel === "direct" }}
            >
              <Text
                style={[
                  styles.channelTabText,
                  channel === "direct" && styles.channelTabTextActive,
                ]}
              >
                Direct messages
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {isRoomChannel && !loading && !accessDenied && (
          <View
            style={styles.presenceBar}
            accessibilityLabel={isVipRoom ? "Live VIP room presence" : "Live event room presence"}
          >
            <View style={styles.presenceAvatars}>
              {presence.avatarUrls.map(
                (avatarUrl: string | null, index: number) => (
                  <View
                    key={`${avatarUrl || "fallback"}-${index}`}
                    style={[
                      styles.presenceAvatar,
                      index > 0 && styles.presenceAvatarOffset,
                    ]}
                    accessibilityLabel={`Attendee ${index + 1} avatar`}
                  >
                    <ProfileAvatar
                      uri={avatarUrl}
                      name={`Attendee ${index + 1}`}
                      isDark={isDark}
                      initialsSize={12}
                    />
                  </View>
                ),
              )}
            </View>
            <Text style={styles.presenceText}>
              {presence.peopleCount === 0
                ? translate(
                    isVipRoom ? "eventChat.zeroPeopleInVipRoom" : "eventChat.zeroPeopleInRoom",
                    isVipRoom ? "0 people in VIP room" : "0 people in room",
                  )
                : translate(
                    isVipRoom ? "eventChat.peopleInVipRoom" : "eventChat.peopleInRoom",
                    isVipRoom ? "{count} people in VIP room" : "{count} people in room",
                    { count: presence.peopleCount },
                  )}
            </Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>
                {translate("eventChat.live", "Live")}
              </Text>
            </View>
          </View>
        )}

        {channel === "direct" && permissions.canSendDirect && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.memberRail}
          >
            {members
              .filter(
                (member) =>
                  member.userId !== "" &&
                  member.userId !== (viewerId || dbUserId),
              )
              .map((member) => (
                <TouchableOpacity
                  key={member.userId}
                  style={[
                    styles.memberChip,
                    recipientId === member.userId && styles.memberChipActive,
                  ]}
                  onPress={() => setRecipientId(member.userId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${member.name}`}
                >
                  <View style={styles.memberAvatar}>
                    <ProfileAvatar
                      uri={member.avatarUrl}
                      name={member.name}
                      isDark={isDark}
                      initialsSize={12}
                    />
                  </View>
                  <Text
                    style={[
                      styles.memberChipText,
                      recipientId === member.userId &&
                        styles.memberChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {member.name}
                  </Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        )}

        {channel === "direct" && selectedMember && (
          <Text style={styles.conversationLabel}>
            Messaging {selectedMember.name}
          </Text>
        )}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error && !messages.length ? (
          <View style={styles.centered}>
            <MaterialIcons
              name="lock-outline"
              size={34}
              color={colors.text.secondary}
            />
            <Text style={styles.errorTitle}>
              {accessDenied
                ? localizedAccessCopy.title
                : translate(
                    "eventChat.unableToLoad",
                    "Unable to load this event room",
                  )}
            </Text>
            <Text style={styles.errorText}>
              {accessDenied ? localizedAccessCopy.body : error}
            </Text>
            {accessDenied && localizedAccessCopy.actionLabel && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => openTicketPurchase()}
              >
                <Text style={styles.retryText}>
                  {localizedAccessCopy.actionLabel}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                if (accessDenied) {
                  router.replace("/dashboard/explore" as any);
                } else {
                  void refreshChat();
                }
              }}
            >
              <Text style={styles.retryText}>
                {accessDenied
                  ? translate(
                      "eventChat.backToExplore",
                      "Go back to Explore events",
                    )
                  : translate("eventChat.tryAgain", "Try again")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            style={styles.messageScroll}
            contentContainerStyle={styles.messageContent}
          >
            {!messages.length && (
              <View style={styles.emptyState}>
                <MaterialIcons
                  name="forum"
                  size={34}
                  color={colors.text.secondary}
                />
                <Text style={styles.emptyTitle}>Be the first to say hello</Text>
                <Text style={styles.emptyText}>
                  Messages from pass holders will appear here.
                </Text>
              </View>
            )}
            {messageRows.map(([message, threadDepth]) =>
              (() => {
                const isOwnMessage =
                  message.is_own_message ??
                  message.sender_id === (viewerId || dbUserId);
                const senderName = message.sender_name || "HASHPASS member";
                const canOpenProfile =
                  Boolean(message.sender_id) &&
                  !message.is_anonymous &&
                  !isOwnMessage;
                const repliedMessage = message.reply_to_message_id
                  ? messages.find(
                      (candidate) =>
                        candidate.id === message.reply_to_message_id,
                    )
                  : null;
                const reactionCounts = message.reactions?.counts || {};
                const visibleReactions = EVENT_CHAT_REACTIONS.filter(
                  (reaction) => (reactionCounts[reaction.type] || 0) > 0,
                );
                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageRow,
                      threadDepth > 0 && styles.replyThreadRow,
                      threadDepth > 0 && { marginLeft: threadDepth * 20 },
                      isOwnMessage && styles.messageRowOwn,
                    ]}
                  >
                    {isOwnMessage ? (
                      <View
                        style={styles.avatar}
                        accessibilityLabel={`${senderName} avatar`}
                      >
                        <ProfileAvatar
                          uri={
                            message.is_anonymous
                              ? null
                              : profileAvatarUrl || message.sender_avatar_url
                          }
                          name={senderName}
                          isDark={isDark}
                        />
                      </View>
                    ) : canOpenProfile ? (
                      <TouchableOpacity
                        onPress={() =>
                          openMessageProfile(message.sender_id, senderName)
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${senderName} profile`}
                      >
                        <View
                          style={styles.avatar}
                          accessibilityLabel={`${senderName} avatar`}
                        >
                          <ProfileAvatar
                            uri={
                              message.is_anonymous
                                ? null
                                : message.sender_avatar_url
                            }
                            name={senderName}
                            isDark={isDark}
                          />
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <View
                        style={styles.avatar}
                        accessibilityLabel={`${senderName} avatar`}
                      >
                        <ProfileAvatar
                          uri={
                            message.is_anonymous
                              ? null
                              : message.sender_avatar_url
                          }
                          name={senderName}
                          isDark={isDark}
                        />
                      </View>
                    )}
                    <View style={styles.messageColumn}>
                      <View style={styles.messageMeta}>
                        {isOwnMessage ? (
                          <Text style={styles.messageAuthor}>{senderName}</Text>
                        ) : canOpenProfile ? (
                          <TouchableOpacity
                            onPress={() =>
                              openMessageProfile(message.sender_id, senderName)
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${senderName} profile`}
                          >
                            <Text style={styles.messageAuthor}>
                              {senderName}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.messageAuthor}>{senderName}</Text>
                        )}
                        <Text style={styles.messageTime}>
                          {formatMessageTime(message.created_at)}
                        </Text>
                      </View>
                      {repliedMessage && (
                        <View style={styles.replyQuote}>
                          <View style={styles.replyQuoteHeader}>
                            <MaterialIcons
                              name="reply"
                              size={13}
                              color={colors.primary}
                            />
                          <Text
                            style={styles.replyQuoteAuthor}
                            numberOfLines={1}
                          >
                            {translate(
                              "eventChat.replyingTo",
                              "Replying to {name}",
                              {
                                name:
                                  repliedMessage.sender_name ||
                                  "HASHPASS member",
                              },
                            )}
                          </Text>
                          </View>
                        </View>
                      )}
                      <View
                        style={[
                          styles.messageBubble,
                          isOwnMessage && styles.messageBubbleOwn,
                        ]}
                      >
                        <Text style={styles.messageText}>
                          {message.message}
                        </Text>
                      </View>
                      <View style={styles.reactionBar}>
                        {!anonymousReadOnly && (
                          <TouchableOpacity
                            style={styles.reactionTrigger}
                            onPress={() =>
                              setReactionPickerMessageId((current) =>
                                current === message.id ? null : message.id,
                              )
                            }
                            accessibilityRole="button"
                            accessibilityLabel={translate(
                              "eventChat.reactToMessage",
                              "React to message",
                            )}
                          >
                            <MaterialIcons
                              name="thumb-up"
                              size={14}
                              color={colors.text.secondary}
                            />
                            <Text style={styles.reactionTriggerText}>
                              {translate("eventChat.react", "React")}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {visibleReactions.map((reaction) => (
                          (() => {
                            const reactionKey = `${message.id}:${reaction.type}`;
                            const reactionUsers =
                              message.reactions?.users?.[reaction.type] || [];
                            const detailsVisible =
                              reactionDetailsKey === reactionKey &&
                              reactionUsers.length > 0;
                            return (
                              <View
                                key={reaction.type}
                                style={styles.reactionChipContainer}
                              >
                                <Pressable
                                  style={[
                                    styles.reactionCount,
                                    message.reactions?.viewerReaction === reaction.type &&
                                      styles.reactionCountActive,
                                  ]}
                                  onPress={() =>
                                    openReactionModal(message.id, reaction.type)
                                  }
                                  onLongPress={() =>
                                    setReactionDetailsKey(reactionKey)
                                  }
                                  onHoverIn={() =>
                                    setReactionDetailsKey(reactionKey)
                                  }
                                  onHoverOut={() =>
                                    setReactionDetailsKey((current) =>
                                      current === reactionKey ? null : current,
                                    )
                                  }
                                  onFocus={() =>
                                    setReactionDetailsKey(reactionKey)
                                  }
                                  onBlur={() =>
                                    setReactionDetailsKey((current) =>
                                      current === reactionKey ? null : current,
                                    )
                                  }
                                  accessibilityRole="button"
                                  accessibilityLabel={`${reaction.label} ${message.reactions?.counts[reaction.type] || 0}`}
                                  accessibilityHint="Open the list of people who reacted"
                                >
                                  <Text style={styles.reactionEmoji}>
                                    {reaction.emoji}
                                  </Text>
                                  <Text style={styles.reactionCountText}>
                                    {reactionCounts[reaction.type]}
                                  </Text>
                                </Pressable>
                                {detailsVisible && (
                                  <Surface
                                    mode={isDark ? "dark" : "light"}
                                    style={styles.reactionUsersPopover}
                                    pointerEvents="none"
                                  >
                                    <Text style={styles.reactionUsersTitle}>
                                      {reaction.emoji} {reaction.label}
                                    </Text>
                                    {reactionUsers.slice(0, 8).map((name, index) => (
                                      <Text
                                        key={`${name}-${index}`}
                                        style={styles.reactionUserName}
                                        numberOfLines={1}
                                      >
                                        {name}
                                      </Text>
                                    ))}
                                    {reactionUsers.length > 8 && (
                                      <Text style={styles.reactionUsersMore}>
                                        +{reactionUsers.length - 8} more
                                      </Text>
                                    )}
                                  </Surface>
                                )}
                              </View>
                            );
                          })()
                        ))}
                      </View>
                      {!anonymousReadOnly && reactionPickerMessageId === message.id && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.reactionPicker}
                        >
                          {EVENT_CHAT_REACTIONS.map((reaction) => (
                            <TouchableOpacity
                              key={reaction.type}
                              style={[
                                styles.reactionOption,
                                message.reactions?.viewerReaction === reaction.type &&
                                  styles.reactionOptionActive,
                              ]}
                              onPress={() => void handleReaction(message, reaction.type)}
                              accessibilityRole="button"
                              accessibilityLabel={reaction.label}
                            >
                              <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      )}
                      {!anonymousReadOnly && (
                        <TouchableOpacity
                          style={styles.replyButton}
                          onPress={() => requestReply(message)}
                          accessibilityRole="button"
                          accessibilityLabel={translate(
                            "eventChat.replyToMessage",
                            "Reply to message",
                          )}
                        >
                          <MaterialIcons
                            name="reply"
                            size={14}
                            color={colors.text.secondary}
                          />
                          <Text style={styles.replyButtonText}>
                            {translate("eventChat.reply", "Reply")}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })(),
            )}
          </ScrollView>
        )}

        {error && messages.length > 0 && (
          <Text style={styles.inlineError}>{error}</Text>
        )}
        {!loading && isRoomChannel && roomRateLimit?.waitingForReply && (
          <View style={styles.rateLimitNotice} accessibilityRole="alert">
            <MaterialIcons name="forum" size={18} color={colors.primary} />
            <Text style={styles.rateLimitText}>
              {translate(
                "eventChat.replyBeforeSending",
                "You have sent {count} messages in a row. Wait for another attendee to reply before sending more.",
                { count: roomRateLimit.consecutiveMessages },
              )}
            </Text>
          </View>
        )}
        {!loading && anonymousReadOnly && !accessDenied && (
          <View style={styles.readOnlyBanner} accessibilityRole="alert">
            <MaterialIcons name="visibility" size={18} color={colors.primary} />
            <View style={styles.readOnlyBannerCopy}>
              <Text style={styles.readOnlyBannerTitle}>
                {translate("eventChat.readOnlyTitle", "Read-only guest view")}
              </Text>
              <Text style={styles.readOnlyBannerText}>
                {translate(
                  "eventChat.readOnlyBody",
                  "Sign in with an event pass to react or reply to comments.",
                )}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.readOnlySignIn}
              onPress={() => router.push("/(shared)/auth" as any)}
              accessibilityRole="button"
              accessibilityLabel={translate("eventChat.signIn", "Sign in")}
            >
              <Text style={styles.readOnlySignInText}>
                {translate("eventChat.signIn", "Sign in")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {!loading && passType === "general" && (
          <View style={styles.upgradeNotice}>
            <Text style={styles.readOnlyNote}>
              General pass: you can read this room. Upgrade to Business or VIP
              to send messages.
            </Text>
            <View style={styles.upgradeActions}>
              <TouchableOpacity
                style={styles.upgradeButton}
                onPress={() => openTicketPurchase("business")}
                accessibilityRole="button"
                accessibilityLabel={translate("eventChat.upgradeBusiness", "Upgrade to Business")}
              >
                <Text style={styles.upgradeButtonText}>
                  {translate("eventChat.upgradeBusiness", "Upgrade to Business")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.upgradeButton, styles.vipButton]}
                onPress={() => openTicketPurchase("vip")}
                accessibilityRole="button"
                accessibilityLabel={translate("eventChat.upgradeVip", "Upgrade to VIP")}
              >
                <Text style={styles.upgradeButtonText}>
                  {translate("eventChat.upgradeVip", "Upgrade to VIP")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {canSend && (
          <View style={styles.composerArea}>
            {replyTo && (
              <View style={styles.replyComposerBanner}>
                <View style={styles.replyComposerCopy}>
                  <Text style={styles.replyComposerLabel}>
                    {translate("eventChat.replyingTo", "Replying to {name}", {
                      name: replyTo.sender_name || "HASHPASS member",
                    })}
                  </Text>
                  <Text style={styles.replyComposerText} numberOfLines={1}>
                    {replyTo.message}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setReplyTo(null)}
                  accessibilityRole="button"
                  accessibilityLabel={translate(
                    "eventChat.cancelReply",
                    "Cancel reply",
                  )}
                >
                  <MaterialIcons
                    name="close"
                    size={20}
                    color={colors.text.secondary}
                  />
                </TouchableOpacity>
              </View>
            )}
            {showEmojiPicker && (
              <View style={styles.emojiPanel}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.emojiCategories}
                >
                  {CHAT_EMOJI_CATEGORIES.map(
                    (category: (typeof CHAT_EMOJI_CATEGORIES)[number]) => (
                      <TouchableOpacity
                        key={category.id}
                        onPress={() => setEmojiCategory(category.id)}
                        style={styles.emojiCategory}
                      >
                        <Text style={styles.emojiCategoryIcon}>
                          {category.icon}
                        </Text>
                        <Text
                          style={[
                            styles.emojiCategoryText,
                            category.id === emojiCategory &&
                              styles.emojiCategoryTextActive,
                          ]}
                        >
                          {category.label}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </ScrollView>
                <View style={styles.emojiGrid}>
                  {activeEmojiCategory.emojis.map((emoji: string) => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => sendMessage(emoji, "emoji")}
                      style={styles.emojiButton}
                      accessibilityLabel={`Send ${emoji}`}
                    >
                      <Text style={styles.emoji}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <View style={styles.composer}>
              <TouchableOpacity
                onPress={() => setShowEmojiPicker((current) => !current)}
                accessibilityRole="button"
                accessibilityLabel="Choose emoji"
              >
                <MaterialIcons
                  name="emoji-emotions"
                  size={24}
                  color={colors.primary}
                />
              </TouchableOpacity>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={
                  channel === "direct"
                    ? "Write a direct message"
                    : isVipRoom
                      ? "Write to the VIP room"
                      : "Write to the event room"
                }
                placeholderTextColor={colors.text.secondary}
                style={styles.input}
                maxLength={2000}
                onSubmitEditing={() => sendMessage(draft)}
                returnKeyType="send"
                accessibilityLabel="Message"
              />
              <TouchableOpacity
                onPress={() => sendMessage(draft)}
                disabled={!draft.trim() || sending}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MaterialIcons
                    name="send"
                    size={24}
                    color={
                      draft.trim() ? colors.primary : colors.text.secondary
                    }
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background.primary },
    header: {
      flexDirection: "row",
      alignItems: "center",
      padding: 18,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    headerCopy: { flex: 1, marginLeft: 14 },
    eyebrow: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    title: {
      color: colors.text.primary,
      fontSize: 18,
      fontWeight: "800",
      marginTop: 3,
    },
    channelTabs: {
      flexDirection: "row",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 2,
      gap: 8,
    },
    channelTab: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.divider,
      paddingHorizontal: 14,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    channelTabActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    channelTabText: {
      color: colors.text.secondary,
      fontWeight: "700",
      fontSize: 13,
    },
    channelTabTextActive: { color: "#fff" },
    presenceBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      gap: 8,
    },
    presenceAvatars: { flexDirection: "row", minWidth: 40, height: 28 },
    presenceAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.background.primary,
      overflow: "hidden",
    },
    presenceAvatarOffset: { marginLeft: -8 },
    presenceText: {
      color: colors.text.secondary,
      fontSize: 12,
      fontWeight: "700",
    },
    liveBadge: {
      flexDirection: "row",
      alignItems: "center",
      marginLeft: "auto",
      gap: 4,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: "#18A957",
    },
    liveText: {
      color: "#18A957",
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    memberRail: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    memberChip: {
      maxWidth: 190,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.divider,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    memberAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      overflow: "hidden",
    },
    memberChipActive: {
      backgroundColor: colors.text.primary,
      borderColor: colors.text.primary,
    },
    memberChipText: {
      color: colors.text.primary,
      fontSize: 12,
      fontWeight: "700",
    },
    memberChipTextActive: { color: colors.background.primary },
    conversationLabel: {
      color: colors.text.secondary,
      fontSize: 12,
      paddingHorizontal: 18,
      paddingBottom: 6,
    },
    messageScroll: { flex: 1 },
    messageContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 30 },
    messageRow: {
      flexDirection: "row",
      alignSelf: "flex-start",
      alignItems: "flex-start",
      maxWidth: "96%",
      marginBottom: 18,
      gap: 10,
    },
    messageRowOwn: { alignSelf: "flex-end", flexDirection: "row-reverse" },
    replyThreadRow: {
      borderLeftWidth: 2,
      borderLeftColor: `${colors.primary}45`,
      paddingLeft: 10,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.background.secondary,
      overflow: "hidden",
    },
    messageColumn: { flexShrink: 1, maxWidth: "88%" },
    messageMeta: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 6,
    },
    messageAuthor: { color: colors.primary, fontSize: 12, fontWeight: "800" },
    messageTime: { color: colors.text.secondary, fontSize: 11 },
    messageBubble: {
      backgroundColor: colors.background.secondary,
      borderRadius: 16,
      borderTopLeftRadius: 5,
      borderWidth: 1,
      borderColor: colors.divider,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    messageBubbleOwn: {
      backgroundColor: colors.primary + "18",
      borderColor: colors.primary + "30",
      borderTopLeftRadius: 16,
      borderTopRightRadius: 5,
    },
    messageText: { color: colors.text.primary, fontSize: 15, lineHeight: 21 },
    reactionBar: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 5,
      marginTop: 6,
    },
    reactionTrigger: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: uiTokens.radius.pill,
    },
    reactionTriggerText: {
      color: colors.text.secondary,
      fontSize: 11,
      fontWeight: "700",
    },
    reactionCount: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: uiTokens.radius.pill,
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    reactionChipContainer: {
      position: "relative",
      zIndex: 2,
    },
    reactionUsersPopover: {
      position: "absolute",
      left: 0,
      bottom: 34,
      minWidth: 150,
      maxWidth: 230,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: uiTokens.radius.small,
      zIndex: 20,
      elevation: 8,
      shadowColor: colors.text.primary,
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    reactionUsersTitle: {
      color: colors.text.primary,
      fontSize: 11,
      fontWeight: "800",
      marginBottom: 4,
    },
    reactionUserName: {
      color: colors.text.secondary,
      fontSize: 11,
      lineHeight: 17,
    },
    reactionUsersMore: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: "700",
      marginTop: 2,
    },
    reactionModalBackdrop: { flex: 1 },
    reactionModalDismissArea: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: uiTokens.space.lg,
    },
    reactionModalCard: {
      width: "100%",
      maxWidth: 560,
      maxHeight: "82%",
      padding: 0,
      overflow: "hidden",
    },
    reactionModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: uiTokens.space.xl,
      paddingVertical: uiTokens.space.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    reactionModalTitle: {
      color: colors.text.primary,
      fontSize: uiTokens.type.title,
      fontWeight: "800",
    },
    reactionModalTabEmoji: {
      color: colors.text.primary,
      fontSize: uiTokens.type.label,
    },
    reactionModalList: {
      flex: 1,
      minHeight: uiTokens.control.minHeight,
    },
    reactionModalListContent: {
      paddingHorizontal: uiTokens.space.xl,
      paddingBottom: uiTokens.space.md,
    },
    reactionModalRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: uiTokens.space.md,
      paddingVertical: uiTokens.space.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    reactionModalAvatar: {
      width: uiTokens.control.minHeight,
      height: uiTokens.control.minHeight,
      borderRadius: uiTokens.radius.circle,
      overflow: "hidden",
    },
    reactionModalUserCopy: { flex: 1, gap: uiTokens.space.xs },
    reactionModalUserName: {
      color: colors.text.primary,
      fontSize: uiTokens.type.body,
      fontWeight: "800",
    },
    reactionModalReaction: {
      color: colors.text.secondary,
      fontSize: uiTokens.type.label,
    },
    reactionModalEmpty: {
      color: colors.text.secondary,
      fontSize: uiTokens.type.body,
      paddingVertical: uiTokens.space.xl,
      textAlign: "center",
    },
    reactionCountActive: {
      backgroundColor: `${colors.primary}18`,
      borderColor: colors.primary,
    },
    reactionCountText: {
      color: colors.text.secondary,
      fontSize: 10,
      fontWeight: "800",
    },
    reactionEmoji: { fontSize: 15, lineHeight: 18 },
    reactionPicker: {
      gap: 5,
      paddingVertical: 4,
      paddingRight: 6,
    },
    reactionOption: {
      width: 30,
      height: 30,
      borderRadius: uiTokens.radius.circle,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    reactionOptionActive: {
      backgroundColor: `${colors.primary}18`,
      borderColor: colors.primary,
    },
    replyQuote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      backgroundColor: colors.background.secondary,
      paddingHorizontal: 9,
      paddingVertical: 6,
      marginBottom: 4,
      borderRadius: 6,
    },
    replyQuoteHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    replyQuoteAuthor: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: "800",
    },
    replyButton: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 3,
      marginTop: 3,
      paddingVertical: 2,
    },
    replyButtonText: {
      color: colors.text.secondary,
      fontSize: 11,
      fontWeight: "700",
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 28,
    },
    errorTitle: {
      color: colors.text.primary,
      fontWeight: "800",
      fontSize: 18,
      marginTop: 12,
    },
    errorText: {
      color: colors.text.secondary,
      textAlign: "center",
      marginTop: 8,
      lineHeight: 20,
    },
    retryButton: {
      marginTop: 16,
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 11,
      borderRadius: 18,
    },
    retryText: { color: "#fff", fontWeight: "800" },
    inlineError: {
      color: colors.primary,
      paddingHorizontal: 16,
      paddingBottom: 6,
      fontSize: 12,
    },
    rateLimitNotice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: `${colors.primary}12`,
    },
    rateLimitText: {
      color: colors.text.primary,
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "600",
    },
    readOnlyNote: {
      color: colors.text.secondary,
      fontSize: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      lineHeight: 17,
    },
    readOnlyBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 10,
      padding: 12,
      borderRadius: uiTokens.radius.input,
      borderWidth: 1,
      borderColor: `${colors.primary}45`,
      backgroundColor: `${colors.primary}10`,
    },
    readOnlyBannerCopy: { flex: 1, gap: 2 },
    readOnlyBannerTitle: {
      color: colors.text.primary,
      fontSize: 12,
      fontWeight: "800",
    },
    readOnlyBannerText: {
      color: colors.text.secondary,
      fontSize: 11,
      lineHeight: 16,
    },
    readOnlySignIn: {
      borderRadius: uiTokens.radius.card,
      paddingHorizontal: 11,
      paddingVertical: 8,
      backgroundColor: colors.primary,
    },
    readOnlySignInText: { color: colors.primaryContrastText, fontSize: 11, fontWeight: "800" },
    upgradeNotice: { paddingBottom: 10, gap: 4 },
    upgradeActions: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
    },
    upgradeButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 12,
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    vipButton: { backgroundColor: colors.text.primary },
    upgradeButtonText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "800",
      textAlign: "center",
    },
    emptyState: { alignItems: "center", paddingVertical: 70 },
    emptyTitle: {
      color: colors.text.primary,
      fontSize: 17,
      fontWeight: "800",
      marginTop: 12,
    },
    emptyText: { color: colors.text.secondary, marginTop: 6 },
    composerArea: { borderTopWidth: 1, borderTopColor: colors.divider },
    replyComposerBanner: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: `${colors.primary}10`,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    replyComposerCopy: { flex: 1 },
    replyComposerLabel: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "800",
    },
    replyComposerText: {
      color: colors.text.secondary,
      fontSize: 12,
      marginTop: 2,
    },
    emojiPanel: { backgroundColor: colors.background.secondary, padding: 10 },
    emojiCategories: { gap: 16, paddingHorizontal: 4 },
    emojiCategory: { alignItems: "center" },
    emojiCategoryIcon: { fontSize: 20 },
    emojiCategoryText: {
      color: colors.text.secondary,
      fontSize: 10,
      marginTop: 2,
    },
    emojiCategoryTextActive: { color: colors.primary, fontWeight: "800" },
    emojiGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
    emojiButton: { width: "12.5%", alignItems: "center", paddingVertical: 5 },
    emoji: { fontSize: 24 },
    composer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      paddingBottom: Platform.OS === "ios" ? 24 : 12,
    },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 100,
      color: colors.text.primary,
      backgroundColor: colors.background.secondary,
      borderRadius: 21,
      paddingHorizontal: 15,
      paddingVertical: 10,
    },
    entryBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.48)",
    },
    entrySheet: {
      backgroundColor: colors.background.primary,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      padding: 22,
      paddingBottom: Platform.OS === "ios" ? 34 : 22,
    },
    entryHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    entryCloseButton: { padding: 4, marginRight: -4 },
    entryEyebrow: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    entryTitle: {
      color: colors.text.primary,
      fontSize: 25,
      fontWeight: "800",
      marginTop: 6,
    },
    entryEventTitle: {
      color: colors.text.secondary,
      fontSize: 14,
      marginTop: 5,
      marginBottom: 18,
    },
    entrySectionTitle: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: "800",
      marginTop: 8,
      marginBottom: 8,
    },
    entryRule: {
      color: colors.text.secondary,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 3,
    },
    identityOption: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.divider,
      borderRadius: 14,
      padding: 12,
      marginTop: 8,
    },
    identityOptionActive: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}12`,
    },
    identityOptionDisabled: { opacity: 0.55 },
    identityRadio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.text.secondary,
    },
    identityRadioActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    identityCopy: { marginLeft: 10, flex: 1 },
    identityTitle: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: "700",
    },
    identitySubtitle: {
      color: colors.text.secondary,
      fontSize: 12,
      marginTop: 3,
    },
    enterButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      alignItems: "center",
      paddingVertical: 14,
      marginTop: 18,
    },
    enterButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    cancelEntryText: {
      color: colors.text.secondary,
      textAlign: "center",
      fontSize: 13,
      fontWeight: "700",
      paddingTop: 14,
    },
  });
