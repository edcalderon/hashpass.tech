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
  { value: 'all_active', label: 'All registered users', detail: 'Active app accounts with a linked identity; email subscriptions are not checked' },
  { value: 'event_attendees', label: 'Event attendees', detail: 'Active pass holders for one event' },
  { value: 'speakers', label: 'Speakers', detail: 'Users linked to active speaker profiles' },
  { value: 'selected', label: 'Selected users', detail: 'Only the accounts you choose below' },
];
const LOCAL_TIMEZONE = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device timezone'; }
  catch { return 'your device timezone'; }
})();

function localDateTimeToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return value.trim() ? undefined : null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    || date.getHours() !== hour || date.getMinutes() !== minute) return undefined;
  return date.toISOString();
}

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
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [expiresAtInput, setExpiresAtInput] = useState('');
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
  const scheduledAt = localDateTimeToIso(scheduledAtInput);
  const expiresAt = localDateTimeToIso(expiresAtInput);
  const timeError = scheduledAt === undefined
    ? 'Enter a valid send time as YYYY-MM-DDTHH:mm.'
    : expiresAt === undefined
      ? 'Enter a valid expiry time as YYYY-MM-DDTHH:mm.'
      : scheduledAt && Date.parse(scheduledAt) <= Date.now()
        ? 'Scheduled send time must be in the future.'
        : expiresAt && Date.parse(expiresAt) <= (scheduledAt ? Date.parse(scheduledAt) : Date.now())
          ? 'Expiry must be later than the send time.'
          : null;
  const canPreview = !!title.trim() && !!message.trim() && !timeError && (audience !== 'selected' || selectedUsers.length > 0);
  const canTest = !!title.trim() && !!message.trim() && selectedUsers.length > 0 && selectedUsers.length <= 5
    && expiresAt !== undefined && (!expiresAt || Date.parse(expiresAt) > Date.now());

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

  const notificationPayload = (includeSchedule = true) => ({
    title: title.trim(),
    message: message.trim(),
    level,
    deepLink: deepLink.trim(),
    pushRequested,
    scheduledAt: includeSchedule && typeof scheduledAt === 'string' ? scheduledAt : null,
    expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
  });

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
        ...notificationPayload(false),
        selectedUserIds: selectedUsers.map((recipient) => recipient.id),
      }, { skipEventSegment: true, retries: 0 });
      if (!response.success) throw new Error(response.error || 'Unable to send the test notification');
      const payload = response.data as { data?: { recipients?: number; pushQueued?: number; pushSkipped?: number; pushRequested?: boolean } } | undefined;
      const result = payload?.data;
      setFeedback(`Test delivered in-app to ${result?.recipients ?? selectedUsers.length} selected account(s). ${result?.pushRequested ? `${result.pushQueued ?? 0} push device(s) queued; ${result.pushSkipped ?? 0} account(s) had no registered device.` : 'Push was not requested.'}`);
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
      const payload = response.data as { data?: { recipients?: number; pushQueued?: number; pushSkipped?: number; pushRequested?: boolean; scheduled?: boolean; scheduledAt?: string | null } } | undefined;
      const result = payload?.data;
      if (result?.scheduled) {
        const when = result.scheduledAt || preview.scheduledAt;
        setFeedback(`Notification scheduled for ${when ? new Date(when).toLocaleString() : 'the selected time'} for ${result.recipients ?? preview.recipientCount.toLocaleString()} account(s).`);
      } else {
        setFeedback(`Notification delivered in-app to ${result?.recipients ?? preview.recipientCount.toLocaleString()} account(s). ${result?.pushRequested ? `Push queued for ${result.pushQueued ?? 0} device(s); ${result.pushSkipped ?? 0} account(s) had no registered device.` : 'Push was not requested.'}`);
      }
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
          {campaign.scheduled_at ? <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>Scheduled for {new Date(campaign.scheduled_at).toLocaleString()} · {LOCAL_TIMEZONE}</Text> : null}
          <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>{campaign.expires_at ? `Expires ${new Date(campaign.expires_at).toLocaleString()} · ${LOCAL_TIMEZONE}` : 'Does not expire'}</Text>
          <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>
            {campaign.status === 'sending'
              ? `${campaign.in_app_sent_count} in-app · push delivery queued or in progress`
              : `${campaign.recipient_count} in-app · push accepted for ${campaign.push_sent_count} account(s) · ${campaign.push_failed_count} push failed · ${campaign.push_skipped_count} without a registered device`}
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
            <FormField
              mode={mode}
              label="Schedule send (optional)"
              value={scheduledAtInput}
              onChangeText={(value) => { setScheduledAtInput(value); invalidatePreview(); }}
              placeholder="YYYY-MM-DDTHH:mm"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityHint={`Leave blank to send immediately. Timezone: ${LOCAL_TIMEZONE}.`}
            />
            <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>
              Leave blank to send immediately. Scheduled times use {LOCAL_TIMEZONE}.
            </Text>
            <FormField
              mode={mode}
              label="Expires at (optional)"
              value={expiresAtInput}
              onChangeText={(value) => { setExpiresAtInput(value); invalidatePreview(); }}
              placeholder="YYYY-MM-DDTHH:mm"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityHint={`Leave blank for a notification that never expires. Timezone: ${LOCAL_TIMEZONE}.`}
            />
            <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>
              Leave blank for no expiry. Expired notices disappear from the in-app inbox; push delivery uses this expiry time too.
            </Text>
            <FilterChip
              mode={mode}
              label={pushRequested ? 'Also send push to opted-in devices' : 'In-app only'}
              selected={pushRequested}
              onPress={() => { setPushRequested((current) => !current); invalidatePreview(); }}
            />
            <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption, lineHeight: 20 }}>
            In-app delivery is always recorded. Push reaches opted-in devices in small background batches; a large audience can take several minutes.
            </Text>
          </View>

          {timeError ? <Text accessibilityRole="alert" style={{ color: palette.danger, fontSize: uiTokens.type.caption }}>{timeError}</Text> : null}

          {feedback ? <Text accessibilityRole="alert" style={{ color: (feedback.startsWith('Audience snapshot') || feedback.startsWith('Test sent') || feedback.startsWith('Test delivered') || feedback.startsWith('Notification delivered') || feedback.startsWith('Notification scheduled')) && !feedback.includes('could not be confirmed') ? palette.success : palette.danger, fontSize: uiTokens.type.caption, lineHeight: 20 }}>{feedback}</Text> : null}

          {preview ? (
            <View style={{ paddingTop: uiTokens.space.md, borderTopWidth: 1, borderTopColor: palette.border, gap: uiTokens.space.sm }}>
              <Text style={{ color: palette.text, fontSize: uiTokens.type.title, fontWeight: '700' }}>Audience preview</Text>
              <Text style={{ color: palette.text, fontSize: uiTokens.type.body }}>{preview.recipientCount.toLocaleString()} active account(s) will receive an in-app notification.</Text>
              {preview.pushRequested ? <Text style={{ color: palette.muted, fontSize: uiTokens.type.body }}>{preview.pushTokenCount.toLocaleString()} registered device(s) are currently eligible for push.</Text> : null}
              {preview.scheduledAt ? <Text style={{ color: palette.text, fontSize: uiTokens.type.body }}>Scheduled for {new Date(preview.scheduledAt).toLocaleString()} ({LOCAL_TIMEZONE}).</Text> : <Text style={{ color: palette.text, fontSize: uiTokens.type.body }}>Will send immediately.</Text>}
              <Text style={{ color: palette.muted, fontSize: uiTokens.type.body }}>{preview.notificationExpiresAt ? `Expires ${new Date(preview.notificationExpiresAt).toLocaleString()} (${LOCAL_TIMEZONE}).` : 'This notification will not expire.'}</Text>
              {preview.sample.map((recipient) => <Text key={recipient.email} style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>{recipient.name ? `${recipient.name} · ` : ''}{recipient.email}</Text>)}
              <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>Preview expires {new Date(preview.expiresAt).toLocaleTimeString()} and can be used once.</Text>
            </View>
          ) : null}

          {confirmingSend && preview ? (
            <View accessibilityRole="alert" style={{ padding: uiTokens.space.md, borderWidth: 1, borderColor: palette.border, borderRadius: uiTokens.radius.card, gap: uiTokens.space.sm }}>
              <Text style={{ color: palette.text, fontSize: uiTokens.type.title, fontWeight: '700' }}>Confirm notification send</Text>
              <Text style={{ color: palette.muted, fontSize: uiTokens.type.body, lineHeight: 22 }}>
                This will {preview.scheduledAt ? `schedule an in-app notification for ${new Date(preview.scheduledAt).toLocaleString()} (${LOCAL_TIMEZONE})` : 'create an in-app notification now'} for {preview.recipientCount.toLocaleString()} active account(s){preview.pushRequested ? ` and send push to ${preview.pushTokenCount.toLocaleString()} registered device(s)` : ''}. {preview.notificationExpiresAt ? `It expires ${new Date(preview.notificationExpiresAt).toLocaleString()} (${LOCAL_TIMEZONE}).` : 'It will not expire.'} The audience snapshot is exact and can be used once.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm }}>
                <ActionButton mode={mode} label="Cancel" variant="secondary" onPress={() => setConfirmingSend(false)} />
                <ActionButton mode={mode} label={preview.scheduledAt ? 'Schedule notification' : 'Send now'} loading={busyAction === 'send'} disabled={!!busyAction} onPress={() => void confirmSend()} />
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm }}>
            <ActionButton mode={mode} label="Preview audience" variant="secondary" loading={busyAction === 'preview'} disabled={!canPreview || !!busyAction} onPress={() => void requestPreview()} />
            <ActionButton mode={mode} label={`Send test to selected (${selectedUsers.length}/5)`} variant="secondary" loading={busyAction === 'test'} disabled={!canTest || !!busyAction} onPress={() => void sendTest()} />
            <ActionButton mode={mode} label={preview?.scheduledAt ? 'Schedule notification' : 'Send to audience'} disabled={!preview || !!busyAction || confirmingSend} onPress={sendCampaign} />
          </View>
          {audience === 'all_active' && preview ? <Text style={{ color: palette.danger, fontSize: uiTokens.type.caption }}>This targets every eligible active linked account. Use the test button first, then confirm the exact count above.</Text> : null}
        </View>
      )}
    </Surface>
  );
}
