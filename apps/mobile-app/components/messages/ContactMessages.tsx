import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { ActionButton, Badge, FormField, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useContactMessaging } from '../../contexts/ContactMessagingContext';
import { useTranslation } from '../../i18n/i18n';
import { apiClient } from '../../lib/api-client';
import { CONTACT_HANDLE, messagingData, normalizeContactHandle } from '../../lib/contact-messaging';
import type { ContactMessagesProps, ContactMessage, ContactConversation } from '../../types/contact-messaging';
import type { ColorMode } from '@hashpass/ui/tokens';
import { MessageAvatar } from './FloatingMessages';

export default function ContactMessages({ mode, peer, handle, onContactAction, onRefreshContacts }: ContactMessagesProps) {
  const context = useContactMessaging();
  const { t } = useTranslation('contacts');
  const palette = uiPalette(mode);
  const [selected, setSelected] = useState(peer);
  const [input, setInput] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);
  useEffect(() => setSelected(peer), [peer]);
  const conversations = context?.snapshot?.conversations ?? [];
  const conversation = conversations.find(item => item.id === selected);
  const normalized = normalizeContactHandle(input);
  const submit = async (claim: boolean) => {
    if (requesting || !CONTACT_HANDLE.test(normalized)) return;
    setRequesting(true); setStatus(''); setStatusError(false);
    try {
      if (await onContactAction({ action: claim ? 'handle' : 'request_handle', handle: normalized })) {
        setInput(''); setStatus(claim ? t('messages.handleSaved', 'Your handle is ready to share.') : t('messages.requestSent', 'Contact request sent. You can message once it is accepted.'));
        onRefreshContacts(); context?.changed();
      } else {
        setStatusError(true); setStatus(t('messages.requestError', 'This handle or request is unavailable. Check the exact @handle and try again.'));
      }
    } finally { setRequesting(false); }
  };
  return <View style={styles.stack}>
    <Surface mode={mode} style={styles.stack}>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{t('messages.title', 'Messages')}</Text>
      <Text style={{ color: palette.muted }}>{t('messages.hint', 'Conversations with your wallet contacts. Accepting a meeting invitation connects both people automatically.')}</Text>
      {handle ? <Badge mode={mode} tone="neutral">@{handle}</Badge> : <Text style={{ color: palette.muted }}>{t('messages.claimHint', 'Claim your unique handle so people can send you contact requests. Handles cannot be changed.')}</Text>}
      <FormField mode={mode} label={handle ? t('messages.exactHandle', 'Contact’s exact @handle') : t('messages.yourHandle', 'Your @handle')}
        value={input} onChangeText={setInput} placeholder="@handle" autoCapitalize="none" autoCorrect={false} maxLength={31} />
      <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>{t('messages.handleHint', '3–30 letters, numbers or underscores. Exact handles only; no user search.')}</Text>
      <ActionButton mode={mode} variant="secondary" label={handle ? t('messages.request', 'Send contact request') : t('messages.claim', 'Claim handle')}
        loading={requesting} disabled={!CONTACT_HANDLE.test(normalized)} onPress={() => void submit(!handle)} />
      {!!status && <Text accessibilityLiveRegion="polite" accessibilityRole={statusError ? 'alert' : undefined} style={{ color: statusError ? palette.danger : palette.success }}>{status}</Text>}
    </Surface>
    {!!context?.error && <Surface mode={mode} style={styles.stack}><Text accessibilityRole="alert" style={{ color: palette.danger }}>{t('messages.unavailable', 'Messages are temporarily unavailable. Please try again.')}</Text><ActionButton mode={mode} label={t('messages.retry', 'Retry')} onPress={() => context.changed()} /></Surface>}
    {context?.loading && !context.snapshot && <ActivityIndicator color={palette.accent} />}
    {conversation && context?.snapshot ? <ConversationThread key={`${context.account}:${conversation.id}`} conversation={conversation} self={context.snapshot.self} mode={mode} version={context.refreshVersion} onChanged={context.changed} onBack={() => setSelected(undefined)} /> :
      <Surface mode={mode} style={styles.stack}>
        {conversations.map(person => <View key={person.id} style={styles.row}>
          <MessageAvatar {...person} mode={mode} />
          <View style={styles.grow}><Text style={[styles.name, { color: palette.text }]}>{person.name}</Text>
            {!!person.handle && <Text style={{ color: palette.muted }}>@{person.handle}</Text>}
            <Text numberOfLines={2} style={{ color: palette.muted }}>{person.preview ?? t('messages.sayHello', 'Start a conversation')}</Text></View>
          <ActionButton mode={mode} variant={person.needs_reply ? 'primary' : 'secondary'} label={person.needs_reply ? t('messages.reply', 'Reply') : t('messages.open', 'Open')}
            accessibilityLabel={`${person.needs_reply ? t('messages.reply', 'Reply') : t('messages.open', 'Open')}: ${person.name}`} onPress={() => setSelected(person.id)} />
        </View>)}
        {!conversations.length && !context?.loading && <Text style={{ color: palette.muted }}>{t('messages.empty', 'Your conversations will appear here after you connect with someone. Send a contact request using their exact @handle, or accept a meeting invitation.')}</Text>}
      </Surface>}
  </View>;
}

function ConversationThread({ conversation, self, mode, version, onChanged, onBack }: { conversation: ContactConversation; self: string; mode: ColorMode; version: number; onChanged: () => void; onBack: () => void }) {
  const { t } = useTranslation('contacts');
  const palette = uiPalette(mode);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [older, setOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pending = useRef<{ id: string; body: string } | null>(null);
  const busy = useRef(false);
  const active = useRef(true);
  const generation = useRef(0);
  const history = useRef<ScrollView>(null);
  const stickToBottom = useRef(true);
  const merge = (batch: ContactMessage[]) => setMessages(previous => [...new Map([...previous, ...batch].map(message => [message.id, message])).values()]
    .sort((a, b) => a.sequence.length - b.sequence.length || a.sequence.localeCompare(b.sequence)));
  const load = async (before?: string) => {
    if (busy.current) return;
    const run = ++generation.current;
    setError(false);
    if (before) { setOlder(true); stickToBottom.current = false; }
    try {
      const data = messagingData<{ messages: ContactMessage[] }>(await apiClient.post('contact-messages', { action: 'thread', peer: conversation.id, ...(before ? { before } : {}) }, { skipEventSegment: true, retries: 0 }));
      if (!active.current || run !== generation.current) return;
      merge(data.messages);
      if (before || !messages.length) setHasMore(data.messages.length === 50);
    } catch { if (active.current && run === generation.current) setError(true); }
    finally { if (active.current && run === generation.current) { setLoading(false); setOlder(false); } }
  };
  useEffect(() => { active.current = true; return () => { active.current = false; generation.current += 1; }; }, []);
  useEffect(() => { void load(); }, [version]);
  const send = async () => {
    const body = draft.trim();
    if (!body || body.length > 4000 || busy.current) return;
    busy.current = true; ++generation.current; setSending(true); setError(false);
    try {
      if (pending.current?.body !== body) pending.current = { body, id: Platform.OS === 'web' ? globalThis.crypto.randomUUID() : (require('expo-crypto') as typeof import('expo-crypto')).randomUUID() };
      const data = messagingData<{ messages: ContactMessage[] }>(await apiClient.post('contact-messages', { action: 'send', peer: conversation.id, ...pending.current }, { skipEventSegment: true, retries: 0 }));
      if (!active.current) return;
      stickToBottom.current = true; merge(data.messages); setDraft(''); pending.current = null; onChanged();
    } catch { if (active.current) setError(true); }
    finally { busy.current = false; if (active.current) { setSending(false); setLoading(false); } }
  };
  return <Surface mode={mode} style={styles.stack}>
    <ActionButton mode={mode} variant="ghost" label={t('messages.back', 'All conversations')} onPress={onBack} />
    <View style={styles.row}><MessageAvatar {...conversation} mode={mode} /><View style={styles.grow}>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{conversation.name}</Text>
      <Text style={{ color: palette.muted }}>{[conversation.role, conversation.company].filter(Boolean).join(' · ')}</Text></View><Badge mode={mode}>{t('messages.connected', 'Connected')}</Badge></View>
    {loading && <ActivityIndicator color={palette.accent} />}
    <ScrollView ref={history} onContentSizeChange={() => { if (stickToBottom.current) history.current?.scrollToEnd({ animated: false }); }}
      onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; stickToBottom.current = contentSize.height - layoutMeasurement.height - contentOffset.y < uiTokens.space.hero; }} scrollEventThrottle={16}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }} style={styles.history} contentContainerStyle={styles.stack} keyboardShouldPersistTaps="handled">
      {hasMore && <ActionButton mode={mode} variant="ghost" loading={older} label={t('messages.older', 'Load older messages')} onPress={() => void load(messages[0]?.sequence)} />}
      {messages.map(message => <View key={message.id} style={[styles.message, { backgroundColor: message.sender === self ? palette.accentSoft : palette.raised, alignSelf: message.sender === self ? 'flex-end' : 'flex-start' }]}>
        <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>{message.sender === self ? t('messages.you', 'You') : conversation.name} · {new Date(message.created_at).toLocaleString()}</Text>
        <Text selectable style={{ color: palette.text, fontSize: uiTokens.type.body }}>{message.body}</Text>
      </View>)}
      {!loading && !messages.length && <Text style={{ color: palette.muted }}>{t('messages.firstMessage', 'You’re connected. Say hello!')}</Text>}
    </ScrollView>
    {error && <View style={styles.stack}><Text accessibilityRole="alert" style={{ color: palette.danger }}>{t('messages.sendError', 'Could not update this conversation. Your draft is saved here; try again.')}</Text><ActionButton mode={mode} variant="ghost" label={t('messages.retry', 'Retry')} onPress={() => void load()} /></View>}
    <FormField mode={mode} label={t('messages.compose', 'Message')} placeholder={t('messages.placeholder', 'Write a message…')} value={draft} onChangeText={setDraft} multiline maxLength={4000} editable={!sending} />
    <ActionButton mode={mode} label={t('messages.send', 'Send message')} loading={sending} disabled={loading || !draft.trim()} onPress={() => void send()} />
  </Surface>;
}
const styles = StyleSheet.create({
  stack: { gap: uiTokens.space.lg }, row: { flexDirection: 'row', gap: uiTokens.space.md, alignItems: 'center', flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 120 }, title: { fontSize: uiTokens.type.title, fontWeight: '700' }, name: { fontSize: uiTokens.type.body, fontWeight: '600' },
  history: { maxHeight: 480 }, message: { maxWidth: '95%', padding: uiTokens.space.md, gap: uiTokens.space.xs, borderRadius: uiTokens.radius.media },
});
