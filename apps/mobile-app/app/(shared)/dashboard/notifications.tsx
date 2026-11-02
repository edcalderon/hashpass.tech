import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useNotifications, type Notification } from '@contexts/NotificationContext';
import { MaterialIcons } from '../../../lib/vector-icons';
import DashboardRefreshButton from '../../../components/dashboard/DashboardRefreshButton';
import { useRouter, useLocalSearchParams } from 'expo-router';
import UnifiedSearchAndFilter from '../../../components/UnifiedSearchAndFilter';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { ActionButton, Badge, SegmentedTabs } from '@hashpass/ui/primitives';
import { useDashboardPageLayout } from '../../../hooks/useDashboardPageLayout';
import { useTranslation } from '../../../i18n/i18n';
import { translateNotification } from '../../../lib/notification-translations';
import { buildNotificationEventPath } from '../../../lib/notification-navigation';
import {
  getNotificationsForInboxTab,
  groupChatNotifications,
  type NotificationInboxItem,
  type NotificationInboxTab,
} from '../../../lib/notification-inbox';

export default function NotificationsScreen() {
  const { isDark, colors } = useTheme();
  const { topInset, bottomInset, column } = useDashboardPageLayout();
  const { notifications, unreadCount, isLoading, markAsRead, markAsUnread, markAllAsRead, archiveNotification, deleteNotification, refreshNotifications } = useNotifications();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation('notifications');
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(mode);
  const styles = getStyles(isDark, colors, topInset, bottomInset);
  const scrollViewRef = useRef<ScrollView>(null);
  const notificationRefs = useRef<{ [key: string]: View | null }>({});

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationInboxTab>('all');
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({});
  const [markingAsRead, setMarkingAsRead] = useState<Set<string>>(new Set());

  // Separate the inbox by intent. Messages stay available in All, but their
  // dedicated tab avoids letting a busy conversation bury action-required
  // event updates.
  const tabFilteredNotifications = useMemo(() => {
    return getNotificationsForInboxTab(notifications, activeTab);
  }, [notifications, activeTab]);

  const tabUnreadCounts = useMemo(() => ({
    all: getNotificationsForInboxTab(notifications, 'all').filter((notification: Notification) => !notification.is_read).length,
    messages: getNotificationsForInboxTab(notifications, 'messages').filter((notification: Notification) => !notification.is_read).length,
    updates: getNotificationsForInboxTab(notifications, 'updates').filter((notification: Notification) => !notification.is_read).length,
    archive: getNotificationsForInboxTab(notifications, 'archive').length,
  }), [notifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshNotifications();
    } finally {
      setRefreshing(false);
    }
  };

  // Handle navigation from dropdown - highlight notification and mark as read
  useEffect(() => {
    const notificationId = params.notificationId as string | undefined;
    const shouldHighlight = params.highlightNotification === 'true';
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    if (notificationId && shouldHighlight) {
      // Find the notification
      const notification = notifications.find((n: any) => n.id === notificationId);
      if (notification && !notification.is_read) {
        // Mark as read when navigating from dropdown
        markAsRead(notificationId).catch(console.error);
      }
      
      // Scroll to notification after a short delay to ensure it's rendered
      timeoutId = setTimeout(() => {
        const notificationView = notificationRefs.current[notificationId];
        if (notificationView && scrollViewRef.current) {
          notificationView.measureLayout(
            scrollViewRef.current as any,
            (x, y) => {
              scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true });
            },
            () => {}
          );
        }
      }, 300);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [params.notificationId, params.highlightNotification, notifications, markAsRead]);

  const handleNotificationPress = async (notification: NotificationInboxItem) => {
    // A grouped chat row represents one conversation. Opening it consumes all
    // unread alerts in that conversation, not only the newest alert.
    const unreadIds = notification.notificationIds.filter((id: string) => {
      const item = notifications.find((candidate: { id: string; is_read: boolean }) => candidate.id === id);
      return item && !item.is_read;
    });
    if (unreadIds.length > 0) {
      await Promise.all(unreadIds.map((id: string) => markAsRead(id)));
    }
    
    // Navigate based on notification type
    if (notification.type === 'ticket_claim_review_required') {
      router.push('/dashboard/admin' as any);
    } else if (notification.type === 'business_invite_review_required') {
      router.push('/dashboard/business-invites' as any);
    } else if (
      notification.type === 'business_invite_approved' ||
      notification.type === 'business_invite_rejected'
    ) {
      router.push('/dashboard/wallet?section=passes' as any);
    } else if (notification.type === 'chat_message' && notification.meeting_id) {
      // Navigate straight to the dedicated chat screen -- meeting-detail
      // doesn't read openChat (that param was silently dropped), it just
      // shows the meeting detail with no way to open chat from there.
      router.push({
        pathname: buildNotificationEventPath(notification, null, 'networking/meeting-chat') as any,
        params: {
          meetingId: notification.meeting_id,
        }
      });
    } else if (notification.type === 'meeting_slot_conflict' && notification.meeting_id) {
      // This meeting already exists (tentative, pending the requester's decision) —
      // route straight to meeting-detail instead of the generic meeting_request_id
      // branch below, which would send it to my-requests instead. Must be checked
      // first since this notification also carries a non-null meeting_request_id.
      router.push({
        pathname: buildNotificationEventPath(notification, null, 'networking/meeting-detail') as any,
        params: {
          meetingId: notification.meeting_id,
        }
      });
    } else if (notification.meeting_request_id) {
      // The destination loads the request through its authenticated event API.
      // Avoid fetching the request and speaker from Supabase in the browser:
      // the speaker lookup was unused, and `.single()` returned 406 when no
      // event-scoped speaker profile existed.
      router.push({
        pathname: buildNotificationEventPath(
          notification,
          notification.meeting_request_event_id
            ? { event_id: notification.meeting_request_event_id }
            : null,
          'networking/my-requests',
        ) as any,
        params: {
          requestId: notification.meeting_request_id,
          highlightRequest: 'true',
        },
      });
    } else if (notification.speaker_id) {
      // Navigate to speaker details
      router.push(buildNotificationEventPath(notification, null, `speakers/${notification.speaker_id}`) as any);
    }
  };

  const handleToggleReadStatus = async (notification: NotificationInboxItem) => {
    // Prevent double-clicking and ensure proper state update
    if (markingAsRead.has(notification.id)) return;

    setMarkingAsRead(prev => new Set(prev).add(notification.id));
    try {
      if (notification.is_read) {
        await Promise.all(notification.notificationIds.map((id: string) => markAsUnread(id)));
      } else {
        await Promise.all(notification.notificationIds.map((id: string) => markAsRead(id)));
      }
    } finally {
      setMarkingAsRead(prev => {
        const next = new Set(prev);
        next.delete(notification.id);
        return next;
      });
    }
  };

  const handleArchiveNotification = async (notification: NotificationInboxItem) => {
    await Promise.all(notification.notificationIds.map((id: string) => archiveNotification(id)));
  };

  const handleDeleteNotification = async (notification: NotificationInboxItem) => {
    Alert.alert(
      t('center.deleteTitle'),
      t('center.deleteMessage'),
      [
        { text: t('center.cancel'), style: 'cancel' },
        { 
          text: t('center.delete'), 
          style: 'destructive',
          onPress: async () => {
            // Archive cards can represent all alerts from one chat. Delete
            // every represented row so the same conversation does not appear
            // again with its next-most-recent notification.
            await Promise.all(notification.notificationIds.map((id: string) => deleteNotification(id)));
            // Clear filtered notifications to refresh the view
            setFilteredNotifications([]);
          }
        }
      ]
    );
  };

  const getNotificationIcon = (type: string) => {
    if (type === 'chat_message') return 'chat-bubble-outline';
    switch (type) {
      case 'meeting_request':
        return 'send';
      case 'meeting_accepted':
        return 'check-circle';
      case 'meeting_declined':
        return 'cancel';
      case 'meeting_expired':
        return 'schedule';
      case 'meeting_reminder':
        return 'schedule';
      case 'boost_received':
        return 'trending-up';
      case 'business_invite_review_required':
      case 'ticket_claim_review_required':
        return 'verified-user';
      case 'business_invite_approved':
        return 'verified';
      case 'business_invite_pending':
      case 'business_invite_rejected':
        return 'schedule';
      case 'system_alert':
        return 'info';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type: string, isUrgent: boolean) => {
    if (isUrgent) return palette.danger;

    switch (type) {
      case 'meeting_accepted':
      case 'business_invite_approved':
        return palette.success;
      case 'meeting_declined':
      case 'meeting_expired':
      case 'business_invite_rejected':
        return palette.danger;
      default:
        return palette.accent;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return t('center.justNow');
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      const translated = t('center.minutesAgo', { minutes });
      // Fallback if translation returns the key itself
      return translated && translated !== 'center.minutesAgo' ? translated : `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      const translated = t('center.hoursAgo', { hours });
      // Fallback if translation returns the key itself
      return translated && translated !== 'center.hoursAgo' ? translated : `${hours}h ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      const translated = t('center.daysAgo', { days });
      // Fallback if translation returns the key itself or doesn't interpolate correctly
      if (translated && translated !== 'center.daysAgo' && translated.includes(String(days))) {
        return translated;
      }
      // Fallback to ensure days is always shown
      return `${days}d ago`;
    }
  };

  // Custom filter logic for notifications
  const customFilterLogic = (data: any[], filters: { [key: string]: any }, query: string) => {
    let filtered = data;

    // Apply search query
    if (query.trim()) {
      const lowercaseQuery = query.toLowerCase();
      filtered = filtered.filter(item => 
        item.title?.toLowerCase().includes(lowercaseQuery) ||
        item.message?.toLowerCase().includes(lowercaseQuery) ||
        item.type?.toLowerCase().includes(lowercaseQuery)
      );
    }

    // Apply filters
    if (filters.readStatus) {
      if (filters.readStatus === 'unread') {
        filtered = filtered.filter(item => !item.is_read);
      } else if (filters.readStatus === 'read') {
        filtered = filtered.filter(item => item.is_read);
      }
    }

    if (filters.type) {
      filtered = filtered.filter(item => item.type === filters.type);
    }

    if (filters.urgent === 'true' || filters.urgent === true) {
      filtered = filtered.filter(item => item.is_urgent === true);
    }

    return filtered;
  };

  // Filter groups for UnifiedSearchAndFilter
  const filterGroups = [
    {
      key: 'readStatus',
      label: t('center.filters.readStatus'),
      type: 'single' as const,
      options: [
        { key: 'all', label: t('center.filters.all'), icon: 'list' },
        { key: 'unread', label: t('center.filters.unread'), icon: 'mail' },
        { key: 'read', label: t('center.filters.read'), icon: 'drafts' },
      ],
    },
    {
      key: 'type',
      label: t('center.filters.type'),
      type: 'single' as const,
      options: [
        { key: '', label: t('center.filters.allTypes'), icon: 'apps' },
        { key: 'meeting_request', label: t('center.filters.meetingRequest'), icon: 'event' },
        { key: 'meeting_accepted', label: t('center.filters.meetingAccepted'), icon: 'check-circle' },
        { key: 'meeting_declined', label: t('center.filters.meetingDeclined'), icon: 'cancel' },
        { key: 'meeting_expired', label: t('center.filters.meetingExpired'), icon: 'schedule' },
        { key: 'meeting_reminder', label: t('center.filters.reminder'), icon: 'schedule' },
        { key: 'boost_received', label: t('center.filters.boostReceived'), icon: 'trending-up' },
        { key: 'system_alert', label: t('center.filters.systemAlert'), icon: 'info' },
        { key: 'chat_message', label: t('center.filters.chatMessage'), icon: 'chat' },
      ],
    },
    {
      key: 'urgent',
      label: t('center.filters.priority'),
      type: 'single' as const,
      options: [
        { key: '', label: t('center.filters.all'), icon: 'star-border' },
        { key: 'true', label: t('center.filters.urgentOnly'), icon: 'priority-high' },
      ],
    },
  ];

  const NotificationCard = ({ notification }: { notification: NotificationInboxItem }) => {
    const iconName = getNotificationIcon(notification.type);
    const iconColor = getNotificationColor(notification.type, notification.is_urgent);
    const isUnread = !notification.is_read;
    const isUpdatingReadState = markingAsRead.has(notification.id);
    // Translate notification to interpolate {speakerName} and {requestName}
    const translatedNotification = translateNotification(notification, t);

    return (
      <View style={styles.notificationCard}>
        <TouchableOpacity
          style={styles.notificationContent}
          onPress={() => handleNotificationPress(notification)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { borderColor: iconColor }]}>
            <MaterialIcons name={iconName as any} size={20} color={iconColor} />
          </View>
          <View style={styles.notificationText}>
            <View style={styles.notificationHeader}>
              <Text
                style={[styles.notificationTitle, isUnread ? styles.unreadText : styles.readText]}
                numberOfLines={2}
              >
                {translatedNotification.title}
              </Text>
              {notification.is_urgent && (
                <Badge mode={mode} tone="neutral" tint={palette.danger} compact>
                  {t('center.urgent')}
                </Badge>
              )}
            </View>
            <Text
              style={[styles.notificationMessage, isUnread ? styles.unreadMessage : styles.readMessage]}
            >
              {translatedNotification.message}
            </Text>
            {notification.type === 'chat_message' && notification.notificationCount > 1 && (
              <View style={styles.conversationSummary}>
                <MaterialIcons name="chat-bubble-outline" size={14} color={palette.accent} />
                <Text style={styles.conversationSummaryText}>
                  {notification.unreadMessageCount > 0
                    ? `${notification.unreadMessageCount} unread in this conversation`
                    : `${notification.notificationCount} messages in this conversation`}
                </Text>
              </View>
            )}
            <View style={styles.metaRow}>
              {isUnread && <View style={styles.unreadDot} />}
              <Text style={styles.notificationTime}>{formatTimeAgo(notification.created_at)}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.actionButtons}>
          {activeTab === 'archive' ? (
            <ActionButton
              mode={mode}
              label={t('center.delete')}
              labelNumberOfLines={1}
              variant="ghost"
              leadingIcon={<MaterialIcons name="delete-outline" size={18} color={palette.muted} />}
              onPress={() => handleDeleteNotification(notification)}
              style={styles.cardAction}
            />
          ) : (
            <>
              <ActionButton
                mode={mode}
                label={isUnread ? t('center.markRead') : t('center.markUnread')}
                labelNumberOfLines={1}
                variant="ghost"
                loading={isUpdatingReadState}
                leadingIcon={(
                  <MaterialIcons
                    name={isUnread ? 'drafts' : 'mark-email-unread'}
                    size={18}
                    color={palette.accent}
                  />
                )}
                onPress={() => handleToggleReadStatus(notification)}
                style={styles.cardAction}
              />
              <ActionButton
                mode={mode}
                label={t('center.archive')}
                labelNumberOfLines={1}
                variant="ghost"
                leadingIcon={<MaterialIcons name="archive" size={18} color={palette.muted} />}
                onPress={() => handleArchiveNotification(notification)}
                style={styles.cardAction}
              />
            </>
          )}
        </View>
      </View>
    );
  };

  // Group chat messages after filtering, so results never duplicate a
  // conversation while still honouring search and advanced filters.
  const sourceNotifications = filteredNotifications ?? tabFilteredNotifications;
  const displayNotifications = useMemo(
    () => groupChatNotifications(sourceNotifications),
    [sourceNotifications],
  );

  if (isLoading && notifications.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <MaterialIcons name="notifications" size={48} color={colors.text.secondary} />
        <Text style={styles.loadingText}>{t('center.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.column, column]}>
      {/* Heading: same eyebrow / title / subtitle pattern as the wallet view */}
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{t('center.eyebrow', 'YOUR INBOX')}</Text>
        <View style={styles.titleRow}>
          <View style={styles.titleGroup}>
            <Text accessibilityRole="header" style={styles.headerTitle}>{t('center.title')}</Text>
            {unreadCount > 0 && activeTab !== 'archive' && (
              <Badge mode={mode} tone="accent" compact>{unreadCount}</Badge>
            )}
          </View>
          {unreadCount > 0 && activeTab !== 'archive' && (
            <ActionButton
              mode={mode}
              label={t('center.markAllRead')}
              labelNumberOfLines={1}
              variant="ghost"
              onPress={markAllAsRead}
            />
          )}
        </View>
        <Text style={styles.subtitle}>
          {t('center.subtitle', 'Messages, meeting updates and event news in one place.')}
        </Text>
      </View>

      {/* Filter Section */}
      <UnifiedSearchAndFilter
        key={activeTab}
        data={tabFilteredNotifications}
        onFilteredData={setFilteredNotifications}
        onSearchChange={setSearchQuery}
        onFilterChange={(filters: Record<string, unknown>) => setActiveFilters(filters)}
        searchPlaceholder={t('center.searchPlaceholder')}
        searchFields={['title', 'message', 'type']}
        filterGroups={filterGroups}
        showResultsCount={true}
        customFilterLogic={customFilterLogic}
      />

      {/* Keep inbox categories and refresh on the dashboard's compact toolbar row. */}
      <View style={styles.tabsRefreshRow}>
        <View style={styles.tabsWrap}>
          <SegmentedTabs
            mode={mode}
            scrollable
            accessibilityLabel={t('center.title')}
            tabs={([
              ['all', t('center.all')],
              ['messages', t('center.messages', 'Messages')],
              ['updates', t('center.updates', 'Updates')],
              ['archive', t('center.archive')],
            ] as const).map(([id, label]) => ({
              id,
              label,
              count: tabUnreadCounts[id],
            }))}
            value={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              setFilteredNotifications(null);
              setSearchQuery('');
              setActiveFilters({});
            }}
            accentColor={colors.primary}
            surfaceColor={colors.background.paper}
          />
        </View>
        <DashboardRefreshButton
          compact
          loading={refreshing}
          disabled={isLoading}
          label={t('center.refresh', 'Refresh')}
          loadingLabel={t('center.refreshing', 'Refreshing…')}
          hint={t('center.refreshHint', 'Fetch the latest notifications')}
          onPress={() => void onRefresh()}
        />
      </View>

      {/* Notifications List */}
      {displayNotifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons 
            name={activeTab === 'archive' ? 'archive' : activeTab === 'messages' ? 'chat-bubble-outline' : 'notifications-none'}
            size={64} 
            color={colors.text.secondary} 
          />
          <Text style={styles.emptyTitle}>
            {searchQuery.trim() || Object.keys(activeFilters).length > 0
              ? t('center.noMatchingNotifications', 'No matching notifications')
              : activeTab === 'archive'
              ? t('center.noArchivedNotifications')
              : activeTab === 'messages'
                ? t('center.noMessages', 'No messages')
                : activeTab === 'updates'
                  ? t('center.noUpdates', 'No updates')
                  : t('center.noNotifications')}
          </Text>
          <Text style={styles.emptyMessage}>
            {searchQuery.trim() || Object.keys(activeFilters).length > 0
              ? t('center.noMatchingNotificationsMessage', 'Try a different search or adjust your filters.')
              : activeTab === 'archive'
              ? t('center.noArchivedNotificationsMessage')
              : activeTab === 'messages'
                ? t('center.noMessagesMessage', 'New chat messages will appear here.')
                : activeTab === 'updates'
                  ? t('center.noUpdatesMessage', 'Meeting and event updates will appear here.')
                  : t('center.noNotificationsMessage')}
          </Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.text.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {displayNotifications.map((notification: any) => (
            <View
              key={notification.id}
              ref={(ref) => {
                notificationRefs.current[notification.id] = ref;
              }}
            >
              <NotificationCard notification={notification} />
            </View>
          ))}
        </ScrollView>
      )}
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, topInset: number = 0, bottomInset: number = 0) => {
  const palette = uiPalette(isDark ? 'dark' : 'light');

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.default,
      paddingTop: topInset,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background.default,
    },
    loadingText: {
      color: colors.text.secondary,
      fontSize: uiTokens.type.body,
      marginTop: uiTokens.space.md,
    },
    heading: {
      gap: uiTokens.space.sm,
      paddingHorizontal: uiTokens.space.lg,
      paddingBottom: uiTokens.space.lg,
    },
    eyebrow: {
      color: colors.text.secondary,
      fontSize: uiTokens.type.caption,
      fontWeight: '700',
      letterSpacing: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: uiTokens.space.sm,
    },
    titleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: uiTokens.space.sm,
    },
    subtitle: {
      color: colors.text.secondary,
      fontSize: uiTokens.type.label,
      lineHeight: 21,
    },
    tabsWrap: {
      flex: 1,
      minWidth: 0,
      paddingBottom: uiTokens.space.sm,
    },
    tabsRefreshRow: {
      flexDirection: 'row',
      paddingHorizontal: uiTokens.space.lg,
      alignItems: 'center',
      gap: uiTokens.space.xs,
      paddingTop: uiTokens.space.xs,
      paddingBottom: uiTokens.space.xs,
    },
    headerTitle: {
      color: colors.text.primary,
      fontSize: uiTokens.type.heading,
      fontWeight: '700',
    },
    column: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: uiTokens.space.lg,
      paddingTop: uiTokens.space.sm,
      paddingBottom: bottomInset,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: uiTokens.space.xl,
    },
    emptyTitle: {
      color: colors.text.primary,
      fontSize: uiTokens.type.title,
      fontWeight: '600',
      marginTop: uiTokens.space.md,
      marginBottom: uiTokens.space.xs,
    },
    emptyMessage: {
      color: colors.text.secondary,
      fontSize: uiTokens.type.body,
      textAlign: 'center',
      lineHeight: 24,
    },
    notificationCard: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
      paddingBottom: uiTokens.space.sm,
      marginBottom: uiTokens.space.sm,
    },
    notificationContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: uiTokens.space.md,
      paddingVertical: uiTokens.space.sm,
    },
    iconContainer: {
      width: uiTokens.control.compactHeight,
      height: uiTokens.control.compactHeight,
      borderRadius: uiTokens.radius.pill,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notificationText: {
      flex: 1,
      minWidth: 0,
      gap: uiTokens.space.xs,
    },
    notificationHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: uiTokens.space.sm,
    },
    notificationTitle: {
      flex: 1,
      color: colors.text.primary,
      fontSize: uiTokens.type.body,
      lineHeight: 22,
    },
    unreadText: {
      fontWeight: '700',
    },
    readText: {
      color: colors.text.secondary,
      fontWeight: '600',
    },
    notificationMessage: {
      fontSize: uiTokens.type.label,
      lineHeight: 20,
    },
    unreadMessage: {
      color: colors.text.primary,
    },
    readMessage: {
      color: colors.text.secondary,
    },
    conversationSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: uiTokens.space.xs,
    },
    conversationSummaryText: {
      color: palette.muted,
      fontSize: uiTokens.type.caption,
      fontWeight: '600',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: uiTokens.space.xs,
    },
    unreadDot: {
      width: 6,
      height: 6,
      borderRadius: uiTokens.radius.pill,
      backgroundColor: palette.accent,
    },
    notificationTime: {
      color: colors.text.secondary,
      fontSize: uiTokens.type.caption,
    },
    actionButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: uiTokens.space.xs,
      paddingLeft: uiTokens.control.compactHeight + uiTokens.space.md,
    },
    cardAction: {
      paddingHorizontal: uiTokens.space.sm,
    },
  });
};
