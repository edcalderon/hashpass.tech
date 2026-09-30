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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '../../lib/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { getCaptchaApiEndpoint } from '../../lib/api-client';
import SupportCaptcha from '../../components/SupportCaptcha';
import { Surface, ActionButton, FormField, Badge, HoverText } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import {
  closeSupportTicket,
  createSupportTicket,
  getSupportAttachmentUrl,
  getSupportTicket,
  sendSupportAttachment,
  sendSupportMessage,
  SUPPORT_ATTACHMENT_ALLOWED_TYPES,
  SUPPORT_ATTACHMENT_MAX_BYTES,
} from '../../lib/support/frappe-support-client';
import type { SupportMessage, SupportTicket } from '../../lib/support/frappe-support-client';
import { SupportRichText } from '../../lib/support/render-html-content';
import { isPickedAttachmentError, pickAttachmentNative } from '../../lib/support/pick-attachment';

const SUPPORT_EMAIL = 'support@hashpass.tech';
const SUPPORT_WEBSITE = 'https://hashpass.tech/support';
// Frappe HD Ticket has no session/visitor system of its own for this
// staff-only instance (see lib/server/frappe-helpdesk.ts) -- "resuming" a
// ticket or live chat is purely a local convenience, keyed on the ticket id
// + the email that raised it, the same pair the server checks on every read.
// A list, not a single ref, so the landing panel can show every ticket
// the visitor has started on this device, not just the most recent one.
const TICKETS_STORAGE_KEY = '@hashpass_support_frappe_tickets';
// Superseded by TICKETS_STORAGE_KEY -- read once for a one-time migration,
// then removed. See the restore effect below.
const LEGACY_ACTIVE_TICKET_STORAGE_KEY = '@hashpass_support_frappe_ticket';
const POLL_INTERVAL_MS = 8000;

type ScreenView = 'landing' | 'form' | 'thread';
type FormIntent = 'ticket' | 'chat';

interface StoredTicketRef {
  ticketId: string;
  email: string;
  subject: string;
  status: string;
  createdAt: string;
}

function confirmAsync(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Keep ticket', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Cancel ticket', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
  // Only required on web -- see SupportCaptcha.web.tsx / .tsx and the server
  // gate in app/api/v1/support/frappe/tickets+api.ts. Native has no solver
  // for Cap's browser-only widget, so the form's canSubmit below never
  // requires a token off web.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const isWeb = Platform.OS === 'web';

  const [trackedTickets, setTrackedTickets] = useState<StoredTicketRef[]>([]);
  const [activeTicketRef, setActiveTicketRef] = useState<StoredTicketRef | null>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webFileInputRef = useRef<HTMLInputElement>(null);

  const persistTickets = useCallback(async (list: StoredTicketRef[]) => {
    setTrackedTickets(list);
    await AsyncStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify(list)).catch(() => null);
  }, []);

  // Prefill from the signed-in user once we know it -- Contact Support stays
  // reachable while logged out (see events/[eventSlug]/tickets.tsx), so this
  // is a convenience, not a requirement, and the field stays editable.
  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
  }, [user?.email]);

  // Load every ticket tracked locally so the landing panel can list them --
  // it always shows first (see the view === 'landing' fallthrough below),
  // never auto-jumps into a thread, matching how a visitor actually expects
  // "Support" to open even when they already have something in flight.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(TICKETS_STORAGE_KEY);
        let list: StoredTicketRef[] = raw ? JSON.parse(raw) : [];

        // One-time migration from the old single-ticket key.
        const legacyRaw = await AsyncStorage.getItem(LEGACY_ACTIVE_TICKET_STORAGE_KEY);
        if (legacyRaw) {
          try {
            const legacy = JSON.parse(legacyRaw);
            if (legacy?.ticketId && legacy?.email && !list.some((t) => t.ticketId === legacy.ticketId)) {
              list = [
                {
                  ticketId: legacy.ticketId,
                  email: legacy.email,
                  subject: 'Your support ticket',
                  status: '',
                  createdAt: new Date().toISOString(),
                },
                ...list,
              ];
            }
          } catch {
            // Ignore a malformed legacy entry -- nothing to migrate.
          }
          await AsyncStorage.removeItem(LEGACY_ACTIVE_TICKET_STORAGE_KEY).catch(() => null);
          await AsyncStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify(list)).catch(() => null);
        }

        if (!cancelled) setTrackedTickets(list);
      } catch {
        // Ignore -- treat as no tracked tickets.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
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
      // Keep the locally cached subject/status fresh so the landing list's
      // ticket cards reflect reality next time it's shown.
      setTrackedTickets((prev) => {
        const next = prev.map((t) =>
          t.ticketId === ref.ticketId ? { ...t, subject: result.ticket.subject, status: result.ticket.status } : t,
        );
        AsyncStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify(next)).catch(() => null);
        return next;
      });
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
    setCaptchaToken(null);
    setCaptchaResetKey((key) => key + 1);
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
    if (isWeb && !captchaToken) {
      setFormError('Please complete the security check.');
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
        captchaToken,
      });
      const ref: StoredTicketRef = {
        ticketId: created.id,
        email: trimmedEmail,
        subject: created.subject || trimmedSubject,
        status: created.status,
        createdAt: created.createdAt || new Date().toISOString(),
      };
      await persistTickets([ref, ...trackedTickets.filter((t) => t.ticketId !== ref.ticketId)]);
      setActiveTicketRef(ref);
      setTicket(created);
      setMessages([]);
      setView('thread');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to send this right now. Please try again.');
    } finally {
      setCaptchaToken(null);
      setCaptchaResetKey((key) => key + 1);
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

  const handleStartNewTicket = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setActiveTicketRef(null);
    setTicket(null);
    setMessages([]);
    setThreadError(null);
    // Tracked tickets stay in the list -- this only clears which one is
    // currently open, so the landing panel (always shown first now) is
    // where the visitor picks a ticket back up or starts a fresh one.
    setView('landing');
  };

  const openTrackedTicket = (ref: StoredTicketRef) => {
    setActiveTicketRef(ref);
    setTicket(null);
    setMessages([]);
    setThreadError(null);
    setView('thread');
  };

  const handleCancelTicket = async (ref: StoredTicketRef) => {
    const confirmed = await confirmAsync(
      'Cancel this ticket?',
      `This closes ticket #${ref.ticketId} and removes it from your list. This can't be undone.`,
    );
    if (!confirmed) return;

    try {
      await closeSupportTicket(ref.ticketId, ref.email);
    } catch {
      // Best-effort -- still forget it locally even if Frappe is
      // unreachable or it was already closed. The visitor removing a
      // ticket from their own list matters more here than a hard failure
      // blocking that removal.
    }

    await persistTickets(trackedTickets.filter((t) => t.ticketId !== ref.ticketId));

    if (activeTicketRef?.ticketId === ref.ticketId) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setActiveTicketRef(null);
      setTicket(null);
      setMessages([]);
      setView('landing');
    }
  };

  const handleOpenAttachment = (fileId: string) => {
    if (!activeTicketRef) return;
    const url = getSupportAttachmentUrl(activeTicketRef.ticketId, activeTicketRef.email, fileId);
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(url).catch(() => null);
    }
  };

  const uploadAttachment = async (file: File) => {
    if (!activeTicketRef) return;
    setAttaching(true);
    setThreadError(null);
    try {
      const sent = await sendSupportAttachment({
        ticketId: activeTicketRef.ticketId,
        email: activeTicketRef.email,
        file,
      });
      setMessages((prev) => [...prev, sent]);
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Unable to send attachment');
    } finally {
      setAttaching(false);
    }
  };

  const handleNativeAttach = async () => {
    try {
      const picked = await pickAttachmentNative();
      if (!picked) return;
      if (isPickedAttachmentError(picked)) {
        setThreadError(picked.message);
        return;
      }
      await uploadAttachment(picked);
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Unable to attach file');
    }
  };

  const handleWebFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!SUPPORT_ATTACHMENT_ALLOWED_TYPES.includes(file.type)) {
      setThreadError('Only images and PDF files can be attached.');
      return;
    }
    if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
      setThreadError('File is too large (10MB max).');
      return;
    }
    uploadAttachment(file);
  };

  const handleAttachPress = () => {
    if (attaching || !activeTicketRef) return;
    if (Platform.OS === 'web') {
      webFileInputRef.current?.click();
    } else {
      handleNativeAttach();
    }
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

  const renderHeader = (title: string, onBack: () => void, rightAction?: React.ReactNode) => (
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
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {rightAction ? (
        <View style={styles.headerAction}>{rightAction}</View>
      ) : (
        <View style={styles.headerSpacer} />
      )}
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
        {renderHeader(
          'Support Chat',
          () => setView('landing'),
          <TouchableOpacity
            onPress={() => handleCancelTicket(activeTicketRef)}
            accessibilityRole="button"
            accessibilityLabel="Cancel ticket"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="delete-outline" size={20} color={palette.danger} />
          </TouchableOpacity>,
        )}
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
              messages.map((item) => {
                // Never surface which real staff/agent account replied --
                // the visitor only ever needs to know it was "them" or
                // "HASHPASS Support". `commentedBy` can't answer that: every
                // reply sent through this API authenticates as the shared
                // Frappe service account, never the visitor's own email, so
                // comparing it against activeTicketRef.email always missed.
                // isVisitorReply (lib/server/frappe-helpdesk.ts) is the real
                // signal -- it survives independently of which Frappe user
                // identity the write API key happens to resolve to.
                const isYou = item.isVisitorReply === true;
                const authorLabel = isYou ? 'You' : 'HASHPASS Support';
                const time = item.createdAt ? formatMessageTime(item.createdAt) : '';
                return (
                  <View key={item.id} style={[styles.messageRow, isYou ? styles.messageRowYou : styles.messageRowSupport]}>
                    <View style={[styles.messageBubble, isYou ? styles.messageBubbleYou : styles.messageBubbleSupport]}>
                      <Text style={[styles.messageAuthor, isYou && styles.messageAuthorYou]}>{authorLabel}</Text>
                      <SupportRichText
                        html={item.content}
                        style={[styles.messageContent, isYou && styles.messageContentYou]}
                        linkColor={isYou ? palette.onAccent : palette.accent}
                        onAttachmentPress={(fileId) => handleOpenAttachment(fileId)}
                      />
                      {time ? (
                        <Text style={[styles.messageTime, isYou && styles.messageTimeYou]}>{time}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.replyRow}>
            <TouchableOpacity
              style={styles.attachButton}
              onPress={handleAttachPress}
              disabled={attaching || sendingReply}
              accessibilityRole="button"
              accessibilityLabel="Attach a file"
            >
              {attaching ? (
                <ActivityIndicator size="small" color={palette.accent} />
              ) : (
                <MaterialIcons name="attach-file" size={20} color={palette.accent} />
              )}
            </TouchableOpacity>
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
          {Platform.OS === 'web' && (
            <input
              ref={webFileInputRef}
              type="file"
              accept={SUPPORT_ATTACHMENT_ALLOWED_TYPES.join(',')}
              onChange={handleWebFileChange}
              style={{ display: 'none' }}
            />
          )}

          <TouchableOpacity onPress={handleStartNewTicket} style={styles.newTicketLink}>
            <MaterialIcons name="add-circle-outline" size={16} color={palette.accent} />
            <Text style={styles.newTicketLinkText}>Back to Support home</Text>
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
              {isWeb ? (
                <SupportCaptcha
                  apiEndpoint={getCaptchaApiEndpoint()}
                  onSolve={setCaptchaToken}
                  onReset={() => setCaptchaToken(null)}
                  onError={() => setCaptchaToken(null)}
                  resetKey={captchaResetKey}
                />
              ) : null}
              {formError ? <Text style={styles.formErrorText}>{formError}</Text> : null}
              <ActionButton
                mode={mode}
                label={isChat ? 'Start Chat' : 'Submit Ticket'}
                onPress={handleSubmitTicket}
                loading={submitting}
                disabled={submitting || (isWeb && !captchaToken)}
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

        {trackedTickets.length > 0 ? (
          <View style={styles.ticketListSection}>
            <Text style={styles.contactTitle}>Your Tickets</Text>
            {trackedTickets.map((t) => (
              <Surface key={t.ticketId} mode={mode} style={styles.ticketListItem}>
                <TouchableOpacity
                  style={styles.ticketListItemMain}
                  onPress={() => openTrackedTicket(t)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ticket ${t.subject || t.ticketId}`}
                >
                  <View style={styles.actionCardIcon}>
                    <MaterialIcons name="confirmation-number" size={20} color={palette.accent} />
                  </View>
                  <View style={styles.actionCardCopy}>
                    <Text style={styles.actionCardTitle} numberOfLines={1}>
                      {t.subject || 'Support ticket'}
                    </Text>
                    <Text style={styles.actionCardSubtitle} numberOfLines={1}>
                      {`#${t.ticketId}${t.status ? ' · ' + t.status : ''}`}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ticketListItemCancel}
                  onPress={() => handleCancelTicket(t)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel ticket"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="delete-outline" size={20} color={palette.danger} />
                </TouchableOpacity>
              </Surface>
            ))}
            <View style={styles.divider} />
          </View>
        ) : null}

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
    headerAction: {
      minWidth: 32,
      alignItems: 'flex-end',
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
    ticketListSection: {
      gap: uiTokens.space.sm,
    },
    ticketListItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: uiTokens.space.sm,
      gap: uiTokens.space.xs,
    },
    ticketListItemMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: uiTokens.space.md,
    },
    ticketListItemCancel: {
      padding: uiTokens.space.sm,
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
    messageRow: {
      flexDirection: 'row',
    },
    messageRowYou: {
      justifyContent: 'flex-end',
    },
    messageRowSupport: {
      justifyContent: 'flex-start',
    },
    messageBubble: {
      maxWidth: '86%',
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: uiTokens.radius.input,
      padding: uiTokens.space.md,
      gap: 2,
    },
    messageBubbleYou: {
      backgroundColor: palette.accentFill,
      borderColor: palette.accentFill,
      borderBottomRightRadius: uiTokens.radius.small,
    },
    messageBubbleSupport: {
      backgroundColor: palette.raised,
      borderBottomLeftRadius: uiTokens.radius.small,
    },
    messageAuthor: {
      fontSize: uiTokens.type.caption,
      fontWeight: '700',
      color: palette.muted,
    },
    messageAuthorYou: {
      color: palette.onAccent,
      opacity: 0.85,
    },
    messageContent: {
      fontSize: uiTokens.type.body,
      color: palette.text,
      lineHeight: 21,
    },
    messageContentYou: {
      color: palette.onAccent,
    },
    messageTime: {
      fontSize: uiTokens.type.caption,
      color: palette.muted,
      marginTop: 2,
      alignSelf: 'flex-end',
    },
    messageTimeYou: {
      color: palette.onAccent,
      opacity: 0.75,
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
    attachButton: {
      width: 44,
      height: 44,
      borderRadius: uiTokens.radius.circle,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accentSoft,
      borderWidth: 1,
      borderColor: palette.border,
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
