import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "../lib/vector-icons";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../hooks/useAuth";
import { useTranslation } from "../i18n/i18n";
import {
  isEventChatAccessDenied,
  getEventChatAccessCopy,
  getEventChatAvatarUrl,
  getEventChatUpgradeUrl,
  heartbeatEventChatPresence,
  loadEventChat,
  loadEventChatMembers,
  sendEventChatMessage,
  type EventChatChannel,
  type EventChatMember,
  type EventChatMessage,
  type EventChatPresence,
} from "../lib/event-chat";
import { CHAT_EMOJI_CATEGORIES, type ChatEmojiCategoryId } from "../lib/chat-emojis";
import { getEventChatPermissions } from "../lib/event-chat-permissions";

type EventRoomChatProps = {
  eventId: string;
  eventTitle: string;
  isPastEvent?: boolean;
};

const formatMessageTime = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

export default function EventRoomChat({ eventId, eventTitle, isPastEvent = false }: EventRoomChatProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { isLoggedIn, dbUserId, user } = useAuth();
  const { t: translate } = useTranslation();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [channel, setChannel] = useState<Exclude<EventChatChannel, "members">>("room");
  const [messages, setMessages] = useState<EventChatMessage[]>([]);
  const [members, setMembers] = useState<EventChatMember[]>([]);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [passType, setPassType] = useState<"general" | "business" | "vip" | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState(() => getEventChatPermissions(null));
  const [presence, setPresence] = useState<EventChatPresence>({ peopleCount: 0, avatarUrls: [] });
  const [roomRateLimit, setRoomRateLimit] = useState<{
    limit: number;
    consecutiveMessages: number;
    waitingForReply: boolean;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<EventChatMessage | null>(null);
  const [emojiCategory, setEmojiCategory] = useState<ChatEmojiCategoryId>("reactions");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const accessDeniedRef = useRef(false);
  const [entryOpen, setEntryOpen] = useState(true);
  const [entered, setEntered] = useState(false);
  const [displayNameMode, setDisplayNameMode] = useState<"profile" | "anonymous">("profile");

  const profileName =
    user?.user_metadata?.full_name?.trim() ||
    user?.email?.split("@")[0]?.trim() ||
    "HASHPASS member";
  const profileAvatarUrl =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null;

  const selectedMember = members.find((member) => member.userId === recipientId) || null;
  const canSend = (channel === "room" ? permissions.canSendRoom : permissions.canSendDirect) &&
    !(channel === "room" && roomRateLimit?.waitingForReply);
  const accessCopy = getEventChatAccessCopy(isPastEvent);
  const localizedAccessCopy = {
    ...accessCopy,
    title: translate(isPastEvent ? "eventChat.pastTitle" : "eventChat.upcomingTitle", accessCopy.title),
    body: translate(isPastEvent ? "eventChat.pastBody" : "eventChat.upcomingBody", accessCopy.body),
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
    setError(null);
    setAccessDenied(false);
    accessDeniedRef.current = false;
    setChannel("room");
  }, [eventId]);

  const refreshChat = useCallback(async (silent = false) => {
    if (!entered) return;
    if (!silent) {
      accessDeniedRef.current = false;
      setAccessDenied(false);
    }
    if (!isLoggedIn) {
      setLoading(false);
      setError("Sign in to join this event room.");
      return;
    }
    if (!silent) setLoading(true);
    try {
      if (channel === "room") {
        await heartbeatEventChatPresence(eventId).catch(() => null);
      }
      const data = await loadEventChat(eventId, channel, recipientId || undefined);
      setViewerId(data.viewerId);
      setPassType(data.passType);
      setPermissions(data.permissions);
      setPresence(data.presence || { peopleCount: 0, avatarUrls: [] });
      setRoomRateLimit(channel === "room" ? data.roomRateLimit || null : null);
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
      setError(chatError instanceof Error ? chatError.message : "Unable to load this event room.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [channel, entered, eventId, isLoggedIn, recipientId]);

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
    setChannel(nextChannel);
    accessDeniedRef.current = false;
    setAccessDenied(false);
    setError(null);
    if (nextChannel === "room") setRecipientId(null);
    setReplyTo(null);
  };

  const openMessageProfile = (senderId: string, senderName: string) => {
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

  const sendMessage = async (message: string, messageType: "text" | "emoji" = "text") => {
    const value = message.trim();
    if (!value || sending) return;
    if (!canSend) {
      if (channel === "room" && roomRateLimit?.waitingForReply) {
        setError(translate(
          "eventChat.replyBeforeSending",
          "You have sent {count} messages in a row. Wait for another attendee to reply before sending more.",
          { count: roomRateLimit.consecutiveMessages },
        ));
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
        recipientId: channel === "direct" ? recipientId || undefined : undefined,
        replyToMessageId: replyTo?.id,
        displayNameMode,
      });
      setDraft("");
      setReplyTo(null);
      setShowEmojiPicker(false);
      await refreshChat(true);
    } catch (sendError) {
      if ((sendError as { status?: number }).status === 429) {
        setRoomRateLimit({ limit: 5, consecutiveMessages: 5, waitingForReply: true });
      }
      setError(sendError instanceof Error ? sendError.message : "Unable to send this message.");
    } finally {
      setSending(false);
    }
  };

  const openUpgrade = async (tier: "business" | "vip") => {
    const purchaseUrl = getEventChatUpgradeUrl(eventId, tier);
    try {
      if (!(await Linking.canOpenURL(purchaseUrl))) throw new Error("Unsupported purchase URL");
      await Linking.openURL(purchaseUrl);
    } catch {
      Alert.alert(
        "Upgrade to " + (tier === "vip" ? "VIP" : "Business"),
        "Visit the " + eventTitle + " ticket page to upgrade your event pass.",
      );
    }
  };

  const activeEmojiCategory = CHAT_EMOJI_CATEGORIES.find(
    (category: (typeof CHAT_EMOJI_CATEGORIES)[number]) => category.id === emojiCategory,
  ) || CHAT_EMOJI_CATEGORIES[0];

  return (
    <>
      <Modal
        visible={entryOpen}
        transparent
        animationType="slide"
        onRequestClose={() => router.back()}
      >
        <View style={styles.entryBackdrop}>
          <View style={styles.entrySheet}>
            <Text style={styles.entryEyebrow}>EVENT ROOM</Text>
            <Text style={styles.entryTitle}>Before you enter</Text>
            <Text style={styles.entryEventTitle} numberOfLines={2}>{eventTitle}</Text>

            <Text style={styles.entrySectionTitle}>Room rules</Text>
            <Text style={styles.entryRule}>• Be respectful. Debate ideas, not people.</Text>
            <Text style={styles.entryRule}>• No spam, harassment, scams, or unsolicited promotion.</Text>
            <Text style={styles.entryRule}>• Keep messages relevant to this event and community.</Text>
            <Text style={styles.entryRule}>• General pass holders can read only. Business and VIP can send.</Text>
            <Text style={styles.entryRule}>• VIP direct messages are for active event pass holders.</Text>

            <Text style={styles.entrySectionTitle}>Display name</Text>
            <TouchableOpacity
              style={[styles.identityOption, displayNameMode === "profile" && styles.identityOptionActive]}
              onPress={() => setDisplayNameMode("profile")}
              accessibilityRole="radio"
              accessibilityState={{ selected: displayNameMode === "profile" }}
            >
              <View style={[styles.identityRadio, displayNameMode === "profile" && styles.identityRadioActive]} />
              <View style={styles.identityCopy}>
                <Text style={styles.identityTitle}>Use my profile name</Text>
                <Text style={styles.identitySubtitle}>{profileName}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.identityOption, displayNameMode === "anonymous" && styles.identityOptionActive]}
              onPress={() => setDisplayNameMode("anonymous")}
              accessibilityRole="radio"
              accessibilityState={{ selected: displayNameMode === "anonymous" }}
            >
              <View style={[styles.identityRadio, displayNameMode === "anonymous" && styles.identityRadioActive]} />
              <View style={styles.identityCopy}>
                <Text style={styles.identityTitle}>Enter as Anonymous</Text>
                <Text style={styles.identitySubtitle}>Your messages will show as Anonymous.</Text>
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
            <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
              <Text style={styles.cancelEntryText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>EVENT ROOM</Text>
          <Text style={styles.title} numberOfLines={1}>{eventTitle}</Text>
        </View>
      </View>

      <View style={styles.channelTabs}>
        <TouchableOpacity
          style={[styles.channelTab, channel === "room" && styles.channelTabActive]}
          onPress={() => chooseChannel("room")}
          accessibilityRole="tab"
          accessibilityState={{ selected: channel === "room" }}
        >
          <Text style={[styles.channelTabText, channel === "room" && styles.channelTabTextActive]}>Global room</Text>
        </TouchableOpacity>
        {permissions.canSendDirect && (
          <TouchableOpacity
            style={[styles.channelTab, channel === "direct" && styles.channelTabActive]}
            onPress={() => chooseChannel("direct")}
            accessibilityRole="tab"
            accessibilityState={{ selected: channel === "direct" }}
          >
            <Text style={[styles.channelTabText, channel === "direct" && styles.channelTabTextActive]}>Direct messages</Text>
          </TouchableOpacity>
        )}
      </View>

      {channel === "room" && !loading && !accessDenied && (
        <View style={styles.presenceBar} accessibilityLabel="Live event room presence">
          <View style={styles.presenceAvatars}>
            {presence.avatarUrls.map((avatarUrl, index) => (
              <Image
                key={`${avatarUrl || "fallback"}-${index}`}
                source={{
                  uri: avatarUrl || getEventChatAvatarUrl({
                    senderId: `${eventId}-attendee-${index}`,
                  }),
                }}
                style={[styles.presenceAvatar, index > 0 && styles.presenceAvatarOffset]}
                accessibilityIgnoresInvertColors
              />
            ))}
          </View>
          <Text style={styles.presenceText}>
            {presence.peopleCount === 0
              ? translate("eventChat.zeroPeopleInRoom", "0 people in room")
              : translate("eventChat.peopleInRoom", "{count} people in room", { count: presence.peopleCount })}
          </Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{translate("eventChat.live", "Live")}</Text>
          </View>
        </View>
      )}

      {channel === "direct" && permissions.canSendDirect && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRail}>
          {members.filter((member) => member.userId !== "" && member.userId !== (viewerId || dbUserId)).map((member) => (
            <TouchableOpacity
              key={member.userId}
              style={[styles.memberChip, recipientId === member.userId && styles.memberChipActive]}
              onPress={() => setRecipientId(member.userId)}
              accessibilityRole="button"
              accessibilityLabel={`Message ${member.name}`}
            >
              <Image
                source={{ uri: member.avatarUrl || getEventChatAvatarUrl({ senderId: member.userId }) }}
                style={styles.memberAvatar}
                accessibilityIgnoresInvertColors
              />
              <Text style={[styles.memberChipText, recipientId === member.userId && styles.memberChipTextActive]} numberOfLines={1}>
                {member.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {channel === "direct" && selectedMember && (
        <Text style={styles.conversationLabel}>Messaging {selectedMember.name}</Text>
      )}

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
      ) : error && !messages.length ? (
        <View style={styles.centered}>
          <MaterialIcons name="lock-outline" size={34} color={colors.text.secondary} />
          <Text style={styles.errorTitle}>{accessDenied ? localizedAccessCopy.title : translate("eventChat.unableToLoad", "Unable to load this event room")}</Text>
          <Text style={styles.errorText}>{accessDenied ? localizedAccessCopy.body : error}</Text>
          {accessDenied && localizedAccessCopy.actionLabel && (
            <TouchableOpacity style={styles.retryButton} onPress={() => openUpgrade("business")}>
              <Text style={styles.retryText}>{localizedAccessCopy.actionLabel}</Text>
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
                ? translate("eventChat.backToExplore", "Go back to Explore events")
                : translate("eventChat.tryAgain", "Try again")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContent}>
          {!messages.length && (
            <View style={styles.emptyState}>
              <MaterialIcons name="forum" size={34} color={colors.text.secondary} />
              <Text style={styles.emptyTitle}>Be the first to say hello</Text>
              <Text style={styles.emptyText}>Messages from pass holders will appear here.</Text>
            </View>
          )}
          {messages.map((message) => (
            (() => {
              const isOwnMessage = message.sender_id === (viewerId || dbUserId);
              const senderName = message.sender_name || "HASHPASS member";
              const repliedMessage = message.reply_to_message_id
                ? messages.find((candidate) => candidate.id === message.reply_to_message_id)
                : null;
              return (
            <View
              key={message.id}
              style={[styles.messageRow, isOwnMessage && styles.messageRowOwn]}
            >
              {isOwnMessage ? (
                <Image
                  source={{
                    uri: getEventChatAvatarUrl({
                      senderId: message.sender_id,
                      senderName: message.sender_name,
                      senderAvatarUrl: profileAvatarUrl || message.sender_avatar_url,
                      isAnonymous: message.sender_name === "Anonymous",
                    }),
                  }}
                  style={styles.avatar}
                  accessibilityLabel={`${senderName} avatar`}
                />
              ) : (
                <TouchableOpacity
                  onPress={() => openMessageProfile(message.sender_id, senderName)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${senderName} profile`}
                >
                  <Image
                    source={{
                      uri: getEventChatAvatarUrl({
                        senderId: message.sender_id,
                        senderName: message.sender_name,
                        senderAvatarUrl: message.sender_avatar_url,
                        isAnonymous: message.sender_name === "Anonymous",
                      }),
                    }}
                    style={styles.avatar}
                    accessibilityLabel={`${senderName} avatar`}
                  />
                </TouchableOpacity>
              )}
              <View style={styles.messageColumn}>
                <View style={styles.messageMeta}>
                  {isOwnMessage ? (
                    <Text style={styles.messageAuthor}>{senderName}</Text>
                  ) : (
                    <TouchableOpacity
                      onPress={() => openMessageProfile(message.sender_id, senderName)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${senderName} profile`}
                    >
                      <Text style={styles.messageAuthor}>{senderName}</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.messageTime}>{formatMessageTime(message.created_at)}</Text>
                </View>
                {repliedMessage && (
                  <View style={styles.replyQuote}>
                    <Text style={styles.replyQuoteAuthor} numberOfLines={1}>
                      {translate("eventChat.replyingTo", "Replying to {name}", { name: repliedMessage.sender_name || "HASHPASS member" })}
                    </Text>
                    <Text style={styles.replyQuoteText} numberOfLines={1}>{repliedMessage.message}</Text>
                  </View>
                )}
                <View style={[styles.messageBubble, isOwnMessage && styles.messageBubbleOwn]}>
                  <Text style={styles.messageText}>{message.message}</Text>
                </View>
                <TouchableOpacity
                  style={styles.replyButton}
                  onPress={() => setReplyTo(message)}
                  accessibilityRole="button"
                  accessibilityLabel={translate("eventChat.replyToMessage", "Reply to message")}
                >
                  <MaterialIcons name="reply" size={14} color={colors.text.secondary} />
                  <Text style={styles.replyButtonText}>{translate("eventChat.reply", "Reply")}</Text>
                </TouchableOpacity>
              </View>
            </View>
              );
            })()
          ))}
        </ScrollView>
      )}

      {error && messages.length > 0 && <Text style={styles.inlineError}>{error}</Text>}
      {!loading && channel === "room" && roomRateLimit?.waitingForReply && (
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
      {!loading && passType === "general" && (
        <View style={styles.upgradeNotice}>
          <Text style={styles.readOnlyNote}>General pass: you can read this room. Upgrade to Business or VIP to send messages.</Text>
          <View style={styles.upgradeActions}>
            <TouchableOpacity style={styles.upgradeButton} onPress={() => openUpgrade("business")} accessibilityRole="button" accessibilityLabel="Upgrade to Business">
              <Text style={styles.upgradeButtonText}>Upgrade to Business</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.upgradeButton, styles.vipButton]} onPress={() => openUpgrade("vip")} accessibilityRole="button" accessibilityLabel="Upgrade to VIP">
              <Text style={styles.upgradeButtonText}>Upgrade to VIP</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {canSend && (
        <View style={styles.composerArea}>
          {replyTo && (
            <View style={styles.replyComposerBanner}>
              <View style={styles.replyComposerCopy}>
                <Text style={styles.replyComposerLabel}>{translate("eventChat.replyingTo", "Replying to {name}", { name: replyTo.sender_name || "HASHPASS member" })}</Text>
                <Text style={styles.replyComposerText} numberOfLines={1}>{replyTo.message}</Text>
              </View>
              <TouchableOpacity onPress={() => setReplyTo(null)} accessibilityRole="button" accessibilityLabel={translate("eventChat.cancelReply", "Cancel reply")}>
                <MaterialIcons name="close" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
          )}
          {showEmojiPicker && (
            <View style={styles.emojiPanel}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiCategories}>
                {CHAT_EMOJI_CATEGORIES.map((category: (typeof CHAT_EMOJI_CATEGORIES)[number]) => (
                  <TouchableOpacity key={category.id} onPress={() => setEmojiCategory(category.id)} style={styles.emojiCategory}>
                    <Text style={styles.emojiCategoryIcon}>{category.icon}</Text>
                    <Text style={[styles.emojiCategoryText, category.id === emojiCategory && styles.emojiCategoryTextActive]}>{category.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.emojiGrid}>
                {activeEmojiCategory.emojis.map((emoji: string) => (
                  <TouchableOpacity key={emoji} onPress={() => sendMessage(emoji, "emoji")} style={styles.emojiButton} accessibilityLabel={`Send ${emoji}`}>
                    <Text style={styles.emoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <View style={styles.composer}>
            <TouchableOpacity onPress={() => setShowEmojiPicker((current) => !current)} accessibilityRole="button" accessibilityLabel="Choose emoji">
              <MaterialIcons name="emoji-emotions" size={24} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={channel === "direct" ? "Write a direct message" : "Write to the event room"}
              placeholderTextColor={colors.text.secondary}
              style={styles.input}
              maxLength={2000}
              onSubmitEditing={() => sendMessage(draft)}
              returnKeyType="send"
              accessibilityLabel="Message"
            />
            <TouchableOpacity onPress={() => sendMessage(draft)} disabled={!draft.trim() || sending} accessibilityRole="button" accessibilityLabel="Send message">
              {sending ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="send" size={24} color={draft.trim() ? colors.primary : colors.text.secondary} />}
            </TouchableOpacity>
          </View>
        </View>
      )}
      </KeyboardAvoidingView>
    </>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  header: { flexDirection: "row", alignItems: "center", padding: 18, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerCopy: { flex: 1, marginLeft: 14 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text.primary, fontSize: 18, fontWeight: "800", marginTop: 3 },
  channelTabs: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  channelTab: { borderRadius: 18, borderWidth: 1, borderColor: colors.divider, paddingHorizontal: 15, paddingVertical: 9 },
  channelTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  channelTabText: { color: colors.text.secondary, fontWeight: "700", fontSize: 13 },
  channelTabTextActive: { color: "#fff" },
  presenceBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 8 },
  presenceAvatars: { flexDirection: "row", minWidth: 40 },
  presenceAvatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.background.primary },
  presenceAvatarOffset: { marginLeft: -8 },
  presenceText: { color: colors.text.secondary, fontSize: 12, fontWeight: "700" },
  liveBadge: { flexDirection: "row", alignItems: "center", marginLeft: "auto", gap: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#18A957" },
  liveText: { color: "#18A957", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  memberRail: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  memberChip: { maxWidth: 160, borderRadius: 16, borderWidth: 1, borderColor: colors.divider, paddingHorizontal: 12, paddingVertical: 7 },
  memberAvatar: { width: 24, height: 24, borderRadius: 12, marginBottom: 4 },
  memberChipActive: { backgroundColor: colors.text.primary, borderColor: colors.text.primary },
  memberChipText: { color: colors.text.primary, fontSize: 12, fontWeight: "700" },
  memberChipTextActive: { color: colors.background.primary },
  conversationLabel: { color: colors.text.secondary, fontSize: 12, paddingHorizontal: 18, paddingBottom: 6 },
  messageScroll: { flex: 1 },
  messageContent: { padding: 16, paddingBottom: 28 },
  messageRow: { flexDirection: "row", alignSelf: "flex-start", maxWidth: "92%", marginBottom: 14, gap: 10 },
  messageRowOwn: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background.secondary },
  messageColumn: { flexShrink: 1, maxWidth: "86%" },
  messageMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  messageAuthor: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  messageTime: { color: colors.text.secondary, fontSize: 11 },
  messageBubble: { backgroundColor: colors.background.secondary, borderRadius: 16, borderTopLeftRadius: 5, paddingHorizontal: 13, paddingVertical: 10 },
  messageBubbleOwn: { backgroundColor: colors.primary + "18", borderTopLeftRadius: 16, borderTopRightRadius: 5 },
  messageText: { color: colors.text.primary, fontSize: 15, lineHeight: 21 },
  replyQuote: { borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: colors.background.secondary, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 4, borderRadius: 6 },
  replyQuoteAuthor: { color: colors.primary, fontSize: 10, fontWeight: "800" },
  replyQuoteText: { color: colors.text.secondary, fontSize: 11, marginTop: 2 },
  replyButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 3, marginTop: 3, paddingVertical: 2 },
  replyButtonText: { color: colors.text.secondary, fontSize: 11, fontWeight: "700" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  errorTitle: { color: colors.text.primary, fontWeight: "800", fontSize: 18, marginTop: 12 },
  errorText: { color: colors.text.secondary, textAlign: "center", marginTop: 8, lineHeight: 20 },
  retryButton: { marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 18 },
  retryText: { color: "#fff", fontWeight: "800" },
  inlineError: { color: colors.primary, paddingHorizontal: 16, paddingBottom: 6, fontSize: 12 },
  rateLimitNotice: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 10, padding: 10, borderRadius: 10, backgroundColor: `${colors.primary}12` },
  rateLimitText: { color: colors.text.primary, flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  readOnlyNote: { color: colors.text.secondary, fontSize: 12, paddingHorizontal: 16, paddingVertical: 10, lineHeight: 17 },
  upgradeNotice: { paddingBottom: 10 },
  upgradeActions: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  upgradeButton: { flex: 1, backgroundColor: colors.primary, borderRadius: 12, alignItems: "center", paddingVertical: 10, paddingHorizontal: 8 },
  vipButton: { backgroundColor: colors.text.primary },
  upgradeButtonText: { color: "#fff", fontSize: 12, fontWeight: "800", textAlign: "center" },
  emptyState: { alignItems: "center", paddingVertical: 70 },
  emptyTitle: { color: colors.text.primary, fontSize: 17, fontWeight: "800", marginTop: 12 },
  emptyText: { color: colors.text.secondary, marginTop: 6 },
  composerArea: { borderTopWidth: 1, borderTopColor: colors.divider },
  replyComposerBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, backgroundColor: `${colors.primary}10`, borderLeftWidth: 3, borderLeftColor: colors.primary },
  replyComposerCopy: { flex: 1 },
  replyComposerLabel: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  replyComposerText: { color: colors.text.secondary, fontSize: 12, marginTop: 2 },
  emojiPanel: { backgroundColor: colors.background.secondary, padding: 10 },
  emojiCategories: { gap: 16, paddingHorizontal: 4 },
  emojiCategory: { alignItems: "center" },
  emojiCategoryIcon: { fontSize: 20 },
  emojiCategoryText: { color: colors.text.secondary, fontSize: 10, marginTop: 2 },
  emojiCategoryTextActive: { color: colors.primary, fontWeight: "800" },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  emojiButton: { width: "12.5%", alignItems: "center", paddingVertical: 5 },
  emoji: { fontSize: 24 },
  composer: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, paddingBottom: Platform.OS === "ios" ? 24 : 12 },
  input: { flex: 1, minHeight: 42, maxHeight: 100, color: colors.text.primary, backgroundColor: colors.background.secondary, borderRadius: 21, paddingHorizontal: 15, paddingVertical: 10 },
  entryBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.48)" },
  entrySheet: { backgroundColor: colors.background.primary, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: Platform.OS === "ios" ? 34 : 22 },
  entryEyebrow: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  entryTitle: { color: colors.text.primary, fontSize: 25, fontWeight: "800", marginTop: 6 },
  entryEventTitle: { color: colors.text.secondary, fontSize: 14, marginTop: 5, marginBottom: 18 },
  entrySectionTitle: { color: colors.text.primary, fontSize: 14, fontWeight: "800", marginTop: 8, marginBottom: 8 },
  entryRule: { color: colors.text.secondary, fontSize: 13, lineHeight: 19, marginBottom: 3 },
  identityOption: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.divider, borderRadius: 14, padding: 12, marginTop: 8 },
  identityOptionActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}12` },
  identityRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.text.secondary },
  identityRadioActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  identityCopy: { marginLeft: 10, flex: 1 },
  identityTitle: { color: colors.text.primary, fontSize: 14, fontWeight: "700" },
  identitySubtitle: { color: colors.text.secondary, fontSize: 12, marginTop: 3 },
  enterButton: { backgroundColor: colors.primary, borderRadius: 14, alignItems: "center", paddingVertical: 14, marginTop: 18 },
  enterButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  cancelEntryText: { color: colors.text.secondary, textAlign: "center", fontSize: 13, fontWeight: "700", paddingTop: 14 },
});
