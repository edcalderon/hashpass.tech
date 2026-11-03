import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  ActionButton,
  Badge,
  FilterChip,
  FormField,
  SegmentedTabs,
  Surface,
} from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { EVENTS } from '../../config/events';
import { createAdminEventOptions } from '../../lib/admin-event-selector';
import { apiClient } from '../../lib/api-client';
import type { AdminEventOption } from '../../types/AdminEventSelector.types';
import type {
  AdminNotificationAudience,
  AdminNotificationCampaign,
  AdminNotificationAction,
  AdminNotificationLevel,
  AdminNotificationPassTier,
  AdminNotificationPreview,
  AdminNotificationRecipient,
  AdminNotificationSection,
  AdminNotificationsManagerProps,
} from '../../types/AdminNotification.types';

const EVENT_OPTIONS = createAdminEventOptions(EVENTS);
const AUDIENCE_OPTIONS: { value: AdminNotificationAudience; label: string; detail: string }[] = [
  { value: 'all_active', label: 'All active users', detail: 'Accounts with a linked app identity' },
  { value: 'event_attendees', label: 'Event attendees', detail: 'Active pass holders for one event' },
  { value: 'speakers', label: 'Speakers', detail: 'Users linked to active speaker profiles' },
  { value: 'selected', label: 'Selected users', detail: 'Only the accounts you choose below' },
];
const PASS_TIER_OPTIONS: { value: AdminNotificationPassTier; label: string }[] = [
  { value: 'all', label: 'All tiers' },
  { value: 'general', label: 'General' },
  { value: 'speaker', label: 'Speaker' },
  { value: 'vip', label: 'VIP' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'free', label: 'Free' },
];
const COMPOSE_TABS = [
  { id: 'compose', label: 'Compose' },
  { id: 'history', label: 'Delivery history' },
] as const;

export default function AdminNotificationsManager({ mode, initialEventId }: AdminNotificationsManagerProps) {
  const palette = uiPalette(mode);
  const [section, setSection] = useState<AdminNotificationSection>('compose');
  const [audience, setAudience] = useState<AdminNotificationAudience>('all_active');
  const [eventId, setEventId] = useState(initialEventId);
  const [passTier, setPassTier] = useState<AdminNotificationPassTier>('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<AdminNotificationLevel>('info');
  const [deepLink, setDeepLink] = useState('');
  const [pushRequested, setPushRequested] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AdminNotificationRecipient[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<AdminNotificationRecipient[]>([]);
  const [preview, setPreview] = useState<AdminNotificationPreview | null>(null);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [campaigns, setCampaigns] = useState<AdminNotificationCampaign[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyAction, setBusyAction] = useState<AdminNotificationAction>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const audienceDetail = useMemo(
    () => AUDIENCE_OPTIONS.find((option) => option.value === audience)?.detail || '',
    [audience],
  );
  const canPreview = !!title.trim() && !!message.trim() && (audience !== 'selected' || selectedUsers.length > 0);
  const canTest = !!title.trim() && !!message.trim() && selectedUsers.length > 0 && selectedUsers.length <= 5;

  const invalidatePreview = () => {
    setPreview(null);
    setConfirmingSend(false);
    setFeedback(null);
  };

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await apiClient.get('admin/notifications', { skipEventSegment: true, retries: 0 });
      if (!response.success) throw new Error(response.error || 'Unable to load delivery history');
      const payload = response.data as { data?: AdminNotificationCampaign[] } | undefined;
      setCampaigns(payload?.data || []);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to load delivery history');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (section === 'history') void loadHistory();
  }, [section, loadHistory]);

  const searchUsers = async () => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setFeedback(null);
    try {
      const response = await apiClient.post('admin/notifications', { action: 'search', query }, { skipEventSegment: true, retries: 0 });
      if (!response.success) throw new Error(response.error || 'Unable to search users');
      const payload = response.data as { data?: AdminNotificationRecipient[] } | undefined;
      setSearchResults(payload?.data || []);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to search users');
    } finally {
      setSearching(false);
    }
  };

  const addUser = (recipient: AdminNotificationRecipient) => {
    setSelectedUsers((current) => current.some((user) => user.id === recipient.id) || current.length >= 20
      ? current
      : [...current, recipient]);
    setSearchResults([]);
    setSearchQuery('');
    invalidatePreview();
  };

  const removeUser = (id: string) => {
    setSelectedUsers((current) => current.filter((user) => user.id !== id));
    invalidatePreview();
  };

  const notificationPayload = () => ({ title: title.trim(), message: message.trim(), level, deepLink: deepLink.trim(), pushRequested });

  const requestPreview = async () => {
    if (!canPreview) return;
    setBusyAction('preview');
    setFeedback(null);
    try {
      const response = await apiClient.post('admin/notifications', {
        action: 'preview',
        ...notificationPayload(),
        audience,
        eventId,
        passTier,
        selectedUserIds: selectedUsers.map((recipient) => recipient.id),
      }, { skipEventSegment: true, retries: 0 });
      if (!response.success) throw new Error(response.error || 'Unable to preview this audience');
      const payload = response.data as { data?: AdminNotificationPreview } | undefined;
      if (!payload?.data?.previewId) throw new Error('The audience preview could not be saved');
      setPreview(payload.data);
      setFeedback('Audience snapshot ready. Review the count and sample before sending.');
    } catch (error) {
      setPreview(null);
      setFeedback(error instanceof Error ? error.message : 'Unable to preview this audience');
    } finally {
      setBusyAction(null);
    }
  };

  const sendTest = async () => {
    if (!canTest) return;
    setBusyAction('test');
    setFeedback(null);
    try {
      const response = await apiClient.post('admin/notifications', {
        action: 'test',
        ...notificationPayload(),
        selectedUserIds: selectedUsers.map((recipient) => recipient.id),
      }, { skipEventSegment: true, retries: 0 });
      if (!response.success) throw new Error(response.error || 'Unable to send the test notification');
      const payload = response.data as { data?: { recipients?: number; pushSent?: number; pushSkipped?: number; pushError?: string | null } } | undefined;
      const result = payload?.data;
      setFeedback(result?.pushError
        ? `Test sent in-app to ${result.recipients ?? selectedUsers.length} selected account(s). ${result.pushError}`
        : `Test sent to ${result?.recipients ?? selectedUsers.length} selected account(s). Push accepted for ${result?.pushSent ?? 0} account(s); no registered device for ${result?.pushSkipped ?? 0} account(s).`);
      await loadHistory();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to send the test notification');
    } finally {
      setBusyAction(null);
    }
  };

  const sendCampaign = () => {
    if (!preview || Date.parse(preview.expiresAt) <= Date.now()) {
      setPreview(null);
      setFeedback('This audience preview expired. Preview it again before sending.');
      return;
    }
    setConfirmingSend(true);
  };

  const confirmSend = async () => {
    if (!preview) return;
    setConfirmingSend(false);
    setPreview(null);
    setBusyAction('send');
    setFeedback(null);
    try {
      const response = await apiClient.post('admin/notifications', {
        action: 'send',
        previewId: preview.previewId,
      }, { skipEventSegment: true, retries: 0 });
      if (!response.success) throw new Error(response.error || 'Unable to send this notification');
      const payload = response.data as { data?: { recipients?: number; pushSent?: number; pushFailed?: number; pushSkipped?: number; pushError?: string | null } } | undefined;
      const result = payload?.data;
      setFeedback(result?.pushError
        ? `Notification delivered in-app to ${result.recipients ?? preview.recipientCount.toLocaleString()} account(s). ${result.pushError}`
        : `Notification delivered in-app to ${result?.recipients ?? preview.recipientCount.toLocaleString()} account(s). Push accepted for ${result?.pushSent ?? 0} account(s); failed for ${result?.pushFailed ?? 0}; no registered device for ${result?.pushSkipped ?? 0}.`);
      await loadHistory();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to send this notification');
    } finally {
      setBusyAction(null);
    }
  };

  const renderHistory = () => (
    <View style={{ gap: uiTokens.space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: uiTokens.space.sm, flexWrap: 'wrap' }}>
        <View>
          <Text style={{ color: palette.text, fontSize: uiTokens.type.title, fontWeight: '700' }}>Recent deliveries</Text>
          <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption, marginTop: uiTokens.space.xs }}>Test sends and audience sends are listed separately.</Text>
        </View>
        <ActionButton mode={mode} variant="secondary" label="Refresh" loading={loadingHistory} onPress={() => void loadHistory()} />
      </View>
      {loadingHistory && campaigns.length === 0 ? <ActivityIndicator color={palette.accent} /> : null}
      {!loadingHistory && campaigns.length === 0 ? (
        <Text style={{ color: palette.muted, paddingVertical: uiTokens.space.lg, textAlign: 'center' }}>No notification sends yet.</Text>
      ) : null}
      {campaigns.map((campaign) => (
        <View key={campaign.id} style={{ paddingVertical: uiTokens.space.md, gap: uiTokens.space.sm, borderTopWidth: 1, borderTopColor: palette.border }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: uiTokens.space.sm }}>
            <Badge mode={mode} tone="neutral" compact>{campaign.is_test ? 'TEST' : 'AUDIENCE'}</Badge>
            <Badge mode={mode} tone="neutral" compact>{campaign.status.toUpperCase()}</Badge>
            <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>{new Date(campaign.created_at).toLocaleString()}</Text>
          </View>
          <Text style={{ color: palette.text, fontSize: uiTokens.type.body, fontWeight: '700' }}>{campaign.title}</Text>
          <Text style={{ color: palette.muted, fontSize: uiTokens.type.body }}>{campaign.message}</Text>
          <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>
            {campaign.recipient_count} in-app · push accepted for {campaign.push_sent_count} account(s) · {campaign.push_failed_count} push failed · {campaign.push_skipped_count} without a registered device
          </Text>
          {campaign.push_error ? <Text style={{ color: palette.danger, fontSize: uiTokens.type.caption }}>{campaign.push_error}</Text> : null}
        </View>
      ))}
    </View>
  );

  return (
    <Surface mode={mode} style={{ padding: uiTokens.space.lg, gap: uiTokens.space.lg }}>
      <View style={{ gap: uiTokens.space.xs }}>
        <Badge mode={mode} tone="neutral" compact>ADMIN · IN-APP + PUSH</Badge>
        <Text style={{ color: palette.text, fontSize: uiTokens.type.heading, fontWeight: '700' }}>App notifications</Text>
        <Text style={{ color: palette.muted, fontSize: uiTokens.type.body, lineHeight: 24 }}>
          Write an in-app update, preview its exact audience, send a controlled test, then confirm the audience send. Email is not used here.
        </Text>
      </View>

      <SegmentedTabs mode={mode} tabs={COMPOSE_TABS} value={section} onChange={setSection} fullWidth accessibilityLabel="Notification tools" />

      {section === 'history' ? renderHistory() : (
        <View style={{ gap: uiTokens.space.lg }}>
          <View style={{ gap: uiTokens.space.sm }}>
            <Text style={{ color: palette.text, fontSize: uiTokens.type.label, fontWeight: '700' }}>Audience</Text>
            <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>{audienceDetail}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm }}>
              {AUDIENCE_OPTIONS.map((option) => (
                <FilterChip
                  key={option.value}
                  mode={mode}
                  label={option.label}
                  selected={audience === option.value}
                  onPress={() => { setAudience(option.value); invalidatePreview(); }}
                />
              ))}
            </View>
          </View>

          {audience === 'event_attendees' ? (
            <View style={{ gap: uiTokens.space.sm }}>
              <Text style={{ color: palette.text, fontSize: uiTokens.type.label, fontWeight: '700' }}>Event</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm }}>
                {EVENT_OPTIONS.map((event: AdminEventOption) => (
                  <FilterChip
                    key={event.eventId}
                    mode={mode}
                    label={event.label}
                    selected={eventId === event.eventId}
                    onPress={() => { setEventId(event.eventId); invalidatePreview(); }}
                  />
                ))}
              </View>
              <Text style={{ color: palette.text, fontSize: uiTokens.type.label, fontWeight: '700', marginTop: uiTokens.space.sm }}>Pass tier</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm }}>
                {PASS_TIER_OPTIONS.map((tier) => (
                  <FilterChip key={tier.value} mode={mode} label={tier.label} selected={passTier === tier.value} onPress={() => { setPassTier(tier.value); invalidatePreview(); }} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ gap: uiTokens.space.sm }}>
            <FormField
                mode={mode}
                label="Find accounts by email"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="Start with two characters"
                returnKeyType="search"
                onSubmitEditing={() => void searchUsers()}
              style={{ minHeight: uiTokens.control.minHeight }}
            />
            <ActionButton mode={mode} label="Search users" variant="secondary" loading={searching} disabled={searchQuery.trim().length < 2} onPress={() => void searchUsers()} />
            {searchResults.map((recipient) => (
              <Pressable key={recipient.id} onPress={() => addUser(recipient)} accessibilityRole="button" accessibilityLabel={`Select ${recipient.email}`} style={{ padding: uiTokens.space.md, borderWidth: 1, borderColor: palette.border, borderRadius: uiTokens.radius.input }}>
                <Text style={{ color: palette.text, fontWeight: '700' }}>{recipient.name || recipient.email}</Text>
                {recipient.name ? <Text style={{ color: palette.muted, marginTop: uiTokens.space.xs }}>{recipient.email}</Text> : null}
              </Pressable>
            ))}
            {selectedUsers.length > 0 ? (
              <View style={{ gap: uiTokens.space.xs }}>
                <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>Selected accounts · {selectedUsers.length} (up to 20)</Text>
                {selectedUsers.map((recipient) => (
                  <View key={recipient.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiTokens.space.sm }}>
                    <Text style={{ color: palette.text, flex: 1 }}>{recipient.email}</Text>
                    <FilterChip mode={mode} label="Remove" onPress={() => removeUser(recipient.id)} />
                  </View>
                ))}
              </View>
            ) : null}
            {audience === 'selected' && selectedUsers.length === 0 ? <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>Add one or more active accounts to target or test.</Text> : null}
          </View>

          <View style={{ gap: uiTokens.space.md }}>
            <FormField mode={mode} label="Notification title" value={title} maxLength={120} onChangeText={(value) => { setTitle(value); invalidatePreview(); }} placeholder="A short, clear heading" />
            <FormField mode={mode} label="Message" value={message} maxLength={2000} multiline onChangeText={(value) => { setMessage(value); invalidatePreview(); }} placeholder="Write the message users will see in their notification inbox." style={{ minHeight: 132, textAlignVertical: 'top', paddingTop: uiTokens.space.md }} />
            <View style={{ gap: uiTokens.space.sm }}>
              <Text style={{ color: palette.text, fontSize: uiTokens.type.label, fontWeight: '700' }}>Priority</Text>
              <View style={{ flexDirection: 'row', gap: uiTokens.space.sm }}>
                <FilterChip mode={mode} label="Standard" selected={level === 'info'} onPress={() => { setLevel('info'); invalidatePreview(); }} />
                <FilterChip mode={mode} label="Important" selected={level === 'important'} onPress={() => { setLevel('important'); invalidatePreview(); }} />
              </View>
            </View>
            <FormField mode={mode} label="In-app link (optional)" value={deepLink} maxLength={512} onChangeText={(value) => { setDeepLink(value); invalidatePreview(); }} placeholder="/dashboard/notifications" autoCapitalize="none" autoCorrect={false} />
            <FilterChip
              mode={mode}
              label={pushRequested ? 'Also send push to opted-in devices' : 'In-app only'}
              selected={pushRequested}
              onPress={() => { setPushRequested((current) => !current); invalidatePreview(); }}
            />
            <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption, lineHeight: 20 }}>
              In-app delivery is always recorded. Push reaches only devices whose users enabled notifications in the app or browser.
            </Text>
          </View>

          {feedback ? <Text accessibilityRole="alert" style={{ color: (feedback.startsWith('Audience snapshot') || feedback.startsWith('Test sent') || feedback.startsWith('Notification delivered')) && !feedback.includes('could not be confirmed') ? palette.success : palette.danger, fontSize: uiTokens.type.caption, lineHeight: 20 }}>{feedback}</Text> : null}

          {preview ? (
            <View style={{ paddingTop: uiTokens.space.md, borderTopWidth: 1, borderTopColor: palette.border, gap: uiTokens.space.sm }}>
              <Text style={{ color: palette.text, fontSize: uiTokens.type.title, fontWeight: '700' }}>Audience preview</Text>
              <Text style={{ color: palette.text, fontSize: uiTokens.type.body }}>{preview.recipientCount.toLocaleString()} active account(s) will receive an in-app notification.</Text>
              {preview.pushRequested ? <Text style={{ color: palette.muted, fontSize: uiTokens.type.body }}>{preview.pushTokenCount.toLocaleString()} registered device(s) are currently eligible for push.</Text> : null}
              {preview.sample.map((recipient) => <Text key={recipient.email} style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>{recipient.name ? `${recipient.name} · ` : ''}{recipient.email}</Text>)}
              <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>Preview expires {new Date(preview.expiresAt).toLocaleTimeString()} and can be used once.</Text>
            </View>
          ) : null}

          {confirmingSend && preview ? (
            <View accessibilityRole="alert" style={{ padding: uiTokens.space.md, borderWidth: 1, borderColor: palette.border, borderRadius: uiTokens.radius.card, gap: uiTokens.space.sm }}>
              <Text style={{ color: palette.text, fontSize: uiTokens.type.title, fontWeight: '700' }}>Confirm notification send</Text>
              <Text style={{ color: palette.muted, fontSize: uiTokens.type.body, lineHeight: 22 }}>
                This will create an in-app notification for {preview.recipientCount.toLocaleString()} active account(s){preview.pushRequested ? ` and send push to ${preview.pushTokenCount.toLocaleString()} registered device(s)` : ''}. The audience snapshot is exact and can be used once.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm }}>
                <ActionButton mode={mode} label="Cancel" variant="secondary" onPress={() => setConfirmingSend(false)} />
                <ActionButton mode={mode} label="Send now" loading={busyAction === 'send'} disabled={!!busyAction} onPress={() => void confirmSend()} />
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm }}>
            <ActionButton mode={mode} label="Preview audience" variant="secondary" loading={busyAction === 'preview'} disabled={!canPreview || !!busyAction} onPress={() => void requestPreview()} />
            <ActionButton mode={mode} label={`Send test to selected (${selectedUsers.length}/5)`} variant="secondary" loading={busyAction === 'test'} disabled={!canTest || !!busyAction} onPress={() => void sendTest()} />
            <ActionButton mode={mode} label="Send to audience" disabled={!preview || !!busyAction || confirmingSend} onPress={sendCampaign} />
          </View>
          {audience === 'all_active' && preview ? <Text style={{ color: palette.danger, fontSize: uiTokens.type.caption }}>This targets every eligible active linked account. Use the test button first, then confirm the exact count above.</Text> : null}
        </View>
      )}
    </Surface>
  );
}
