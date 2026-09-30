import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Linking,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '../../lib/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { Surface, ActionButton, FormField, Badge, HoverText } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import {
  createSupportTicket,
  getSupportTicket,
  sendSupportMessage,
} from '../../lib/support/frappe-support-client';
import type { SupportMessage, SupportTicket } from '../../lib/support/frappe-support-client';

const SUPPORT_EMAIL = 'support@hashpass.tech';
const SUPPORT_WEBSITE = 'https://hashpass.tech/support';
// Frappe HD Ticket has no session/visitor system of its own for this
// staff-only instance (see lib/server/frappe-helpdesk.ts) -- "resuming" a
// ticket or live chat is purely a local convenience, keyed on the ticket id
// + the email that raised it, the same pair the server checks on every read.
const ACTIVE_TICKET_STORAGE_KEY = '@hashpass_support_frappe_ticket';
const POLL_INTERVAL_MS = 8000;

type ScreenView = 'landing' | 'form' | 'thread';
type FormIntent = 'ticket' | 'chat';

interface StoredTicketRef {
  ticketId: string;
  email: string;
}

export default function SupportScreen() {
  const { isDark } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(isDark);
  const styles = getStyles(palette);

  const [view, setView] = useState<ScreenView>('landing');
  const [restoring, setRestoring] = useState(true);

  const [formIntent, setFormIntent] = useState<FormIntent>('ticket');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [activeTicketRef, setActiveTicketRef] = useState<StoredTicketRef | null>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Prefill from the signed-in user once we know it -- Contact Support stays
  // reachable while logged out (see events/[eventSlug]/tickets.tsx), so this
  // is a convenience, not a requirement, and the field stays editable.
  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
  }, [user?.email]);

  // Resume a previously started ticket/chat on load, if we have one saved locally.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ACTIVE_TICKET_STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as StoredTicketRef;
        if (parsed?.ticketId && parsed?.email) {
          setActiveTicketRef(parsed);
          setView('thread');
        }
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadThread = useCallback(async (ref: StoredTicketRef, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setThreadLoading(true);
    setThreadError(null);
    try {
      const result = await getSupportTicket(ref.ticketId, ref.email);
      setTicket(result.ticket);
      setMessages(result.messages);
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Unable to load ticket');
    } finally {
      setThreadLoading(false);
    }
  }, []);

  // No focus-aware polling precedent exists elsewhere in this app (no
  // useFocusEffect/useIsFocused usage for a similar live view) -- a plain
  // interval scoped to this screen being mounted, same shape as
  // event-info.tsx's isEventFinished ticker, is enough here since this is a
  // dedicated full-screen view, not a tab that stays mounted in the background.
  useEffect(() => {
    if (view !== 'thread' || !activeTicketRef) return undefined;
    loadThread(activeTicketRef);

    pollRef.current = setInterval(() => {
      loadThread(activeTicketRef, { silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [view, activeTicketRef, loadThread]);

  const openForm = (intent: FormIntent) => {
    setFormIntent(intent);
    setFormError(null);
    setSubject(intent === 'chat' ? 'Live chat conversation' : '');
    setMessage('');
    setView('form');
  };

  const handleSubmitTicket = async () => {
    const trimmedEmail = email.trim();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    if (!trimmedEmail || !trimmedSubject || !trimmedMessage) {
      setFormError('Please fill in your email, subject, and message.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const created = await createSupportTicket({
        email: trimmedEmail,
        subject: trimmedSubject,
        message: trimmedMessage,
        context: `Platform: ${Platform.OS} - Source: ${formIntent === 'chat' ? 'Live Chat' : 'Contact form'}`,
      });
      const ref: StoredTicketRef = { ticketId: created.id, email: trimmedEmail };
      await AsyncStorage.setItem(ACTIVE_TICKET_STORAGE_KEY, JSON.stringify(ref));
      setActiveTicketRef(ref);
      setTicket(created);
      setMessages([]);
      setView('thread');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to send this right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    const trimmed = replyText.trim();
    if (!trimmed || !activeTicketRef || sendingReply) return;

    setSendingReply(true);
    setThreadError(null);
    try {
      const sent = await sendSupportMessage({
        ticketId: activeTicketRef.ticketId,
        email: activeTicketRef.email,
        content: trimmed,
      });
      setMessages((prev) => [...prev, sent]);
      setReplyText('');
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Unable to send message');
    } finally {
      setSendingReply(false);
    }
  };

  const handleStartNewTicket = async () => {
    await AsyncStorage.removeItem(ACTIVE_TICKET_STORAGE_KEY).catch(() => null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setActiveTicketRef(null);
    setTicket(null);
    setMessages([]);
    setThreadError(null);
    setView('landing');
  };

  const handleEmailSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => null);
  };

  const handleOpenWebsite = () => {
    if (Platform.OS === 'web') {
      window.open(SUPPORT_WEBSITE, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(SUPPORT_WEBSITE).catch(() => null);
    }
  };

  const renderHeader = (title: string, onBack: () => void) => (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name="arrow-back" size={22} color={palette.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (restoring) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (view === 'thread' && activeTicketRef) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader('Support Chat', () => router.back())}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.threadContent}>
            <Surface mode={mode} style={styles.ticketSummary}>
              <View style={styles.ticketSummaryRow}>
                <HoverText mode={mode} style={styles.ticketSubject} numberOfLines={1}>
                  {ticket?.subject || 'Your support ticket'}
                </HoverText>
                {ticket?.status ? (
                  <Badge mode={mode} tone="accent" compact>
                    {ticket.status}
                  </Badge>
                ) : null}
              </View>
              <HoverText mode={mode} style={styles.ticketMeta} numberOfLines={1}>
                {`Ticket #${activeTicketRef.ticketId} · ${activeTicketRef.email}`}
              </HoverText>
            </Surface>

            {threadError ? (
              <View style={styles.errorBanner}>
                <MaterialIcons name="error-outline" size={16} color={palette.danger} />
                <Text style={[styles.errorBannerText, { color: palette.danger }]}>{threadError}</Text>
              </View>
            ) : null}

            {threadLoading && messages.length === 0 ? (
              <View style={styles.centerInline}>
                <ActivityIndicator size="small" color={palette.accent} />
              </View>
            ) : messages.length === 0 ? (
              <Text style={styles.emptyThreadText}>
                Your message is with our support team. Replies will show up here.
              </Text>
            ) : (
              messages.map((item) => (
                <View key={item.id} style={styles.messageBubble}>
                  <Text style={styles.messageAuthor}>{item.commentedBy || 'You'}</Text>
                  <Text style={styles.messageContent}>{item.content}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.replyRow}>
            <TextInput
              style={styles.replyInput}
              placeholder="Write a message..."
              placeholderTextColor={palette.muted}
              value={replyText}
              onChangeText={setReplyText}
              editable={!sendingReply}
              multiline
            />
            <TouchableOpacity
              style={[styles.replySendButton, (!replyText.trim() || sendingReply) && styles.replySendButtonDisabled]}
              onPress={handleSendReply}
              disabled={!replyText.trim() || sendingReply}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sendingReply ? (
                <ActivityIndicator size="small" color={palette.onAccent} />
              ) : (
                <MaterialIcons name="send" size={18} color={palette.onAccent} />
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleStartNewTicket} style={styles.newTicketLink}>
            <MaterialIcons name="add-circle-outline" size={16} color={palette.accent} />
            <Text style={styles.newTicketLinkText}>Start a new ticket</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (view === 'form') {
    const isChat = formIntent === 'chat';
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader(isChat ? 'Start Live Chat' : 'Open a Ticket', () => setView('landing'))}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            <Surface mode={mode} style={styles.formCard}>
              <FormField
                mode={mode}
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!submitting}
              />
              {!isChat && (
                <FormField
                  mode={mode}
                  label="Subject"
                  placeholder="Brief description of your issue"
                  value={subject}
                  onChangeText={setSubject}
                  editable={!submitting}
                />
              )}
              <FormField
                mode={mode}
                label="Message"
                placeholder={isChat ? 'How can we help?' : 'Describe your issue, bug, or question in detail...'}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={6}
                style={styles.textArea}
                editable={!submitting}
              />
              {formError ? <Text style={styles.formErrorText}>{formError}</Text> : null}
              <ActionButton
                mode={mode}
                label={isChat ? 'Start Chat' : 'Submit Ticket'}
                onPress={handleSubmitTicket}
                loading={submitting}
                disabled={submitting}
                trailingIcon={<MaterialIcons name={isChat ? 'chat' : 'send'} size={18} color={palette.onAccent} />}
              />
            </Surface>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeader('Support', () => router.back())}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <MaterialIcons name="help-outline" size={44} color={palette.accent} />
          <Text style={styles.introTitle}>Need Help?</Text>
          <Text style={styles.introDescription}>
            Open a support ticket or start a live chat with our team -- both go straight to the HASHPASS support desk.
          </Text>
        </View>

        <TouchableOpacity onPress={() => openForm('chat')} accessibilityRole="button" accessibilityLabel="Live Chat">
          <Surface mode={mode} style={styles.actionCard}>
            <View style={styles.actionCardIcon}>
              <MaterialIcons name="chat" size={24} color={palette.accent} />
            </View>
            <View style={styles.actionCardCopy}>
              <Text style={styles.actionCardTitle}>Live Chat</Text>
              <Text style={styles.actionCardSubtitle}>Message our support team directly</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
          </Surface>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => openForm('ticket')} accessibilityRole="button" accessibilityLabel="Open a Ticket">
          <Surface mode={mode} style={styles.actionCard}>
            <View style={styles.actionCardIcon}>
              <MaterialIcons name="confirmation-number" size={24} color={palette.accent} />
            </View>
            <View style={styles.actionCardCopy}>
              <Text style={styles.actionCardTitle}>Open a Ticket</Text>
              <Text style={styles.actionCardSubtitle}>Describe your issue in detail for our team</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
          </Surface>
        </TouchableOpacity>

        <View style={styles.divider} />

        <Text style={styles.contactTitle}>Other Ways to Reach Us</Text>

        <TouchableOpacity onPress={handleOpenWebsite} accessibilityRole="link" accessibilityLabel="Open support website">
          <Surface mode={mode} style={styles.actionCard}>
            <View style={styles.actionCardIcon}>
              <MaterialIcons name="language" size={22} color={palette.accent} />
            </View>
            <View style={styles.actionCardCopy}>
              <Text style={styles.actionCardTitle}>Support Website</Text>
              <Text style={styles.actionCardSubtitle}>hashpass.tech/support</Text>
            </View>
            <MaterialIcons name="open-in-new" size={18} color={palette.muted} />
          </Surface>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleEmailSupport} accessibilityRole="link" accessibilityLabel="Email support">
          <Surface mode={mode} style={styles.actionCard}>
            <View style={styles.actionCardIcon}>
              <MaterialIcons name="email" size={22} color={palette.accent} />
            </View>
            <View style={styles.actionCardCopy}>
              <Text style={styles.actionCardTitle}>Support Email</Text>
              <Text style={styles.actionCardSubtitle}>{SUPPORT_EMAIL}</Text>
            </View>
            <MaterialIcons name="open-in-new" size={18} color={palette.muted} />
          </Surface>
        </TouchableOpacity>

        <Text style={styles.footerText}>We typically respond within 24-48 hours.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (palette: ReturnType<typeof uiPalette>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.canvas,
    },
    flex: {
      flex: 1,
    },
    centerFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerInline: {
      paddingVertical: uiTokens.space.xl,
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: uiTokens.space.lg,
      paddingVertical: uiTokens.space.md,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    backButton: {
      padding: uiTokens.space.xs,
      marginLeft: -uiTokens.space.xs,
    },
    headerTitle: {
      fontSize: uiTokens.type.title,
      fontWeight: '700',
      color: palette.text,
    },
    headerSpacer: {
      width: 32,
    },
    content: {
      padding: uiTokens.space.lg,
      paddingBottom: uiTokens.space.xxl,
      gap: uiTokens.space.md,
      maxWidth: 640,
      alignSelf: 'center',
      width: '100%',
    },
    intro: {
      alignItems: 'center',
      gap: uiTokens.space.sm,
      marginBottom: uiTokens.space.md,
    },
    introTitle: {
      fontSize: uiTokens.type.title,
      fontWeight: '700',
      color: palette.text,
    },
    introDescription: {
      fontSize: uiTokens.type.body,
      color: palette.muted,
      textAlign: 'center',
      lineHeight: 22,
      paddingHorizontal: uiTokens.space.md,
    },
    actionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: uiTokens.space.md,
      padding: uiTokens.space.lg,
    },
    actionCardIcon: {
      width: 44,
      height: 44,
      borderRadius: uiTokens.radius.circle,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accentSoft,
      borderWidth: 1,
      borderColor: palette.border,
    },
    actionCardCopy: {
      flex: 1,
      gap: 2,
    },
    actionCardTitle: {
      fontSize: uiTokens.type.label,
      fontWeight: '700',
      color: palette.text,
    },
    actionCardSubtitle: {
      fontSize: uiTokens.type.caption,
      color: palette.muted,
    },
    divider: {
      height: 1,
      backgroundColor: palette.border,
      marginVertical: uiTokens.space.md,
    },
    contactTitle: {
      fontSize: uiTokens.type.label,
      fontWeight: '700',
      color: palette.text,
      marginBottom: uiTokens.space.xs,
    },
    footerText: {
      fontSize: uiTokens.type.caption,
      color: palette.muted,
      textAlign: 'center',
      marginTop: uiTokens.space.md,
    },
    // Form (ticket / chat compose)
    formContent: {
      padding: uiTokens.space.lg,
      maxWidth: 640,
      alignSelf: 'center',
      width: '100%',
    },
    formCard: {
      gap: uiTokens.space.md,
    },
    textArea: {
      minHeight: 120,
      textAlignVertical: 'top',
    },
    formErrorText: {
      fontSize: uiTokens.type.caption,
      color: palette.danger,
    },
    // Thread / live chat
    threadContent: {
      padding: uiTokens.space.lg,
      gap: uiTokens.space.md,
      maxWidth: 640,
      alignSelf: 'center',
      width: '100%',
    },
    ticketSummary: {
      gap: uiTokens.space.xs,
    },
    ticketSummaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: uiTokens.space.sm,
    },
    ticketSubject: {
      flex: 1,
      fontSize: uiTokens.type.label,
      fontWeight: '700',
      color: palette.text,
    },
    ticketMeta: {
      fontSize: uiTokens.type.caption,
      color: palette.muted,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: uiTokens.space.xs,
      padding: uiTokens.space.sm,
      borderRadius: uiTokens.radius.small,
      backgroundColor: palette.accentSoft,
    },
    errorBannerText: {
      flex: 1,
      fontSize: uiTokens.type.caption,
    },
    emptyThreadText: {
      fontSize: uiTokens.type.body,
      color: palette.muted,
      textAlign: 'center',
      paddingVertical: uiTokens.space.xl,
    },
    messageBubble: {
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: uiTokens.radius.input,
      padding: uiTokens.space.md,
      gap: 2,
    },
    messageAuthor: {
      fontSize: uiTokens.type.caption,
      fontWeight: '700',
      color: palette.muted,
    },
    messageContent: {
      fontSize: uiTokens.type.body,
      color: palette.text,
      lineHeight: 21,
    },
    replyRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: uiTokens.space.sm,
      paddingHorizontal: uiTokens.space.lg,
      paddingVertical: uiTokens.space.md,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    replyInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: uiTokens.radius.input,
      backgroundColor: palette.raised,
      color: palette.text,
      paddingHorizontal: uiTokens.space.md,
      paddingVertical: uiTokens.space.sm,
      fontSize: uiTokens.type.body,
    },
    replySendButton: {
      width: 44,
      height: 44,
      borderRadius: uiTokens.radius.circle,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accentFill,
    },
    replySendButtonDisabled: {
      opacity: 0.45,
    },
    newTicketLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: uiTokens.space.xs,
      paddingVertical: uiTokens.space.sm,
    },
    newTicketLinkText: {
      fontSize: uiTokens.type.caption,
      color: palette.accent,
      fontWeight: '600',
    },
  });
