import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, StatusBar } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useNotifications } from '@contexts/NotificationContext';
import { MaterialIcons } from '../../../lib/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import UnifiedSearchAndFilter from '../../../components/UnifiedSearchAndFilter';
import { useScroll } from '@contexts/ScrollContext';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
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
  const { headerHeight } = useScroll();
  const { notifications, unreadCount, isLoading, markAsRead, markAsUnread, markAllAsRead, archiveNotification, deleteNotification, refreshNotifications } = useNotifications();
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation('notifications');
  // Calculate nav bar height (StatusBar + header content)
  const navBarHeight = (StatusBar.currentHeight || 0) + 80;
  const styles = getStyles(isDark, colors, navBarHeight, headerHeight);
  const scrollViewRef = useRef<ScrollView>(null);
  const notificationRefs = useRef<{ [key: string]: View | null }>({});

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationInboxTab>('all');
  const [filteredNotifications, setFilteredNotifications] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [markingAsRead, setMarkingAsRead] = useState<Set<string>>(new Set());

  // Separate the inbox by intent. Messages stay available in All, but their
  // dedicated tab avoids letting a busy conversation bury action-required
  // event updates.
  const tabFilteredNotifications = useMemo(() => {
    return getNotificationsForInboxTab(notifications, activeTab);
  }, [notifications, activeTab]);

  const tabUnreadCounts = useMemo(() => ({
    all: getNotificationsForInboxTab(notifications, 'all').filter((notification) => !notification.is_read).length,
    messages: getNotificationsForInboxTab(notifications, 'messages').filter((notification) => !notification.is_read).length,
    updates: getNotificationsForInboxTab(notifications, 'updates').filter((notification) => !notification.is_read).length,
    archive: getNotificationsForInboxTab(notifications, 'archive').length,
  }), [notifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
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
    if (notification.type === 'chat_message' && notification.meeting_id) {
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
      try {
        // Fetch meeting request details to get all necessary data
        const { data: meetingRequest, error } = await supabase
          .from('meeting_requests')
          .select(`
            id,
            event_id,
            speaker_id,
            speaker_name,
            requester_id,
            requester_name,
            requester_company,
            status,
            message,
            meeting_scheduled_at,
            meeting_location,
            duration_minutes,
            note
          `)
          .eq('id', notification.meeting_request_id)
          .single();

        if (error) {
          console.error('Error fetching meeting request:', error);
          // Fallback: navigate to my-requests page
          router.push(buildNotificationEventPath(notification, null, 'networking/my-requests') as any);
          return;
        }

        if (meetingRequest) {
          // Fetch speaker details for image and company
          // Note: speaker_id in meeting_requests is UUID (user_id from bsl_speakers)
          const { data: speaker } = await supabase
            .from('bsl_speakers')
            .select('imageurl, company, id, user_id')
            .eq('user_id', (meetingRequest as any).speaker_id)
            .single();

          // Navigate to meeting detail page with all necessary params
          // Navigate to my-requests page instead of meeting-detail
          // This allows users to see the request in context and take actions
          router.push({
            pathname: buildNotificationEventPath(notification, meetingRequest, 'networking/my-requests') as any,
            params: {
              requestId: (meetingRequest as any).id,
              highlightRequest: 'true'
            }
          });
        } else {
          // Fallback: navigate to my-requests page
          router.push(buildNotificationEventPath(notification, null, 'networking/my-requests') as any);
        }
      } catch (error) {
        console.error('Error navigating to meeting detail:', error);
        // Fallback: navigate to my-requests page
        router.push(buildNotificationEventPath(notification, null, 'networking/my-requests') as any);
      }
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

  const handleDeleteNotification = async (notificationId: string) => {
    Alert.alert(
      t('center.deleteTitle'),
      t('center.deleteMessage'),
      [
        { text: t('center.cancel'), style: 'cancel' },
        { 
          text: t('center.delete'), 
          style: 'destructive',
          onPress: async () => {
            await deleteNotification(notificationId);
            // Clear filtered notifications to refresh the view
            setFilteredNotifications([]);
          }
        }
      ]
    );
  };

  const getNotificationIcon = (type: string) => {
    if (type === 'chat_message') return 'chat';
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
      case 'system_alert':
        return 'info';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type: string, isUrgent: boolean) => {
    if (isUrgent) return '#FF3B30';
    
    switch (type) {
      case 'chat_message':
        return '#5856D6';
      case 'meeting_request':
        return '#007AFF';
      case 'meeting_accepted':
        return '#34A853';
      case 'meeting_declined':
        return '#FF9500';
      case 'meeting_reminder':
        return '#5856D6';
      case 'boost_received':
        return '#FF2D92';
      case 'system_alert':
        return '#8E8E93';
      default:
        return '#007AFF';
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
    // Translate notification to interpolate {speakerName} and {requestName}
    const translatedNotification = translateNotification(notification, t);

    return (
      <View
        style={[
          styles.notificationCard,
          isUnread && styles.unreadNotification,
          !isUnread && styles.readNotification
        ]}
      >
        {/* Top Right X Button - Only in Archive Tab */}
        {activeTab === 'archive' && (
          <TouchableOpacity
            style={styles.closeButton}
            onPress={(e) => {
              e.stopPropagation();
              handleDeleteNotification(notification.id);
            }}
          >
            <MaterialIcons name="close" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        )}

        {/* Content */}
        <TouchableOpacity
          style={styles.notificationContent}
          onPress={() => handleNotificationPress(notification)}
          activeOpacity={0.7}
        >
          <View style={[
            styles.iconContainer, 
            { backgroundColor: iconColor + '20' },
            isUnread && styles.unreadIconContainer
          ]}>
            <MaterialIcons 
              name={iconName as any} 
              size={24} 
              color={iconColor} 
            />
            {isUnread && (
              <View style={styles.unreadDot} />
            )}
          </View>
          
          <View style={styles.notificationText}>
            <View style={styles.notificationHeader}>
              <Text style={[
                styles.notificationTitle,
                isUnread && styles.unreadText,
                !isUnread && styles.readText
              ]}>
                {translatedNotification.title}
              </Text>
              <View style={styles.headerActions}>
                {notification.is_urgent && (
                  <View style={styles.urgentBadge}>
                    <Text style={styles.urgentText}>{t('center.urgent')}</Text>
                  </View>
                )}
                {activeTab !== 'archive' && !markingAsRead.has(notification.id) && (
                  <TouchableOpacity
                    style={styles.markReadButtonInline}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleToggleReadStatus(notification);
                    }}
                    disabled={markingAsRead.has(notification.id)}
                  >
                    <MaterialIcons 
                      name={notification.is_read ? "mark-email-unread" : "drafts"} 
                      size={16} 
                      color="#007AFF" 
                    />
                  </TouchableOpacity>
                )}
                {activeTab !== 'archive' && markingAsRead.has(notification.id) && (
                  <View style={styles.markReadButtonInline}>
                    <MaterialIcons name="hourglass-empty" size={16} color={colors.text.secondary} />
                  </View>
                )}
              </View>
            </View>
            
            <Text style={[
              styles.notificationMessage,
              isUnread && styles.unreadMessage,
              !isUnread && styles.readMessage
            ]}>
              {translatedNotification.message}
            </Text>
            {notification.type === 'chat_message' && notification.notificationCount > 1 && (
              <View style={styles.conversationSummary}>
                <MaterialIcons name="chat-bubble-outline" size={14} color={iconColor} />
                <Text style={styles.conversationSummaryText}>
                  {notification.unreadMessageCount > 0
                    ? `${notification.unreadMessageCount} unread in this conversation`
                    : `${notification.notificationCount} messages in this conversation`}
                </Text>
              </View>
            )}
            
            <Text style={styles.notificationTime}>
              {formatTimeAgo(notification.created_at)}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Bottom Right Action Buttons - Only in All Tab */}
        {activeTab !== 'archive' && (
          <View style={styles.bottomActionButtons}>
            <TouchableOpacity
              style={[
                styles.toggleReadButton,
                notification.is_read && styles.toggleReadButtonRead
              ]}
              onPress={() => handleToggleReadStatus(notification)}
              disabled={markingAsRead.has(notification.id)}
            >
              {markingAsRead.has(notification.id) ? (
                <MaterialIcons name="hourglass-empty" size={18} color={colors.text.secondary} />
              ) : notification.is_read ? (
                <>
                  <MaterialIcons name="mark-email-unread" size={18} color="#007AFF" />
                  <Text style={styles.toggleReadButtonText}>{t('center.markUnread')}</Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="drafts" size={18} color="#007AFF" />
                  <Text style={styles.toggleReadButtonText}>{t('center.markRead')}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.archiveButtonBottom}
              onPress={() => handleArchiveNotification(notification)}
            >
              <MaterialIcons 
                name="archive" 
                size={18} 
                color={!notification.is_read ? "#007AFF" : colors.text.secondary} 
              />
              <Text style={[
                styles.archiveButtonText,
                !notification.is_read && styles.archiveButtonTextActive
              ]}>
                {t('center.archive')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // Group chat messages after filtering, so results never duplicate a
  // conversation while still honouring search and advanced filters.
  const sourceNotifications = filteredNotifications.length > 0
    ? filteredNotifications
    : tabFilteredNotifications;
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{t('center.title')}</Text>
          {unreadCount > 0 && activeTab !== 'archive' && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.notificationHeaderActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('center.refresh', 'Refresh notifications')}
            accessibilityHint={t('center.refreshHint', 'Fetch the latest notifications')}
            disabled={refreshing || isLoading}
            style={[styles.refreshButton, (refreshing || isLoading) && styles.refreshButtonDisabled]}
            onPress={() => void onRefresh()}
          >
            <MaterialIcons name="refresh" size={18} color={colors.primary} />
            <Text style={styles.refreshButtonText}>
              {refreshing ? t('center.refreshing', 'Refreshing…') : t('center.refresh', 'Refresh')}
            </Text>
          </TouchableOpacity>
          {unreadCount > 0 && activeTab !== 'archive' && (
            <TouchableOpacity style={styles.markAllButton} onPress={markAllAsRead}>
              <Text style={styles.markAllText}>{t('center.markAllRead')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Inbox tabs */}
      <View style={styles.tabContainer}>
        {([
          ['all', t('center.all')],
          ['messages', t('center.messages', 'Messages')],
          ['updates', t('center.updates', 'Updates')],
          ['archive', t('center.archive')],
        ] as const).map(([tab, label]) => (
          <TouchableOpacity
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => {
              setActiveTab(tab);
              setFilteredNotifications([]);
              setSearchQuery('');
            }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{label}</Text>
            {tabUnreadCounts[tab] > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{tabUnreadCounts[tab]}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter Section */}
      <UnifiedSearchAndFilter
        data={tabFilteredNotifications}
        onFilteredData={setFilteredNotifications}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('center.searchPlaceholder')}
        searchFields={['title', 'message', 'type']}
        filterGroups={filterGroups}
        showResultsCount={true}
        customFilterLogic={customFilterLogic}
      />

      {/* Notifications List */}
      {displayNotifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons 
            name={activeTab === 'archive' ? 'archive' : activeTab === 'messages' ? 'chat-bubble-outline' : 'notifications-none'}
            size={64} 
            color={colors.text.secondary} 
          />
          <Text style={styles.emptyTitle}>
            {activeTab === 'archive'
              ? t('center.noArchivedNotifications')
              : activeTab === 'messages'
                ? t('center.noMessages', 'No messages')
                : activeTab === 'updates'
                  ? t('center.noUpdates', 'No updates')
                  : t('center.noNotifications')}
          </Text>
          <Text style={styles.emptyMessage}>
            {activeTab === 'archive'
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
  );
}

const getStyles = (isDark: boolean, colors: any, navBarHeight: number = 0, scrollHeaderHeight: number = 0) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
    paddingTop: Math.max(scrollHeaderHeight || 0, (StatusBar.currentHeight || 0) + 80),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.default,
  },
  loadingText: {
    fontSize: 16,
    color: colors.text.secondary,
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: colors.background.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: `${colors.primary}55`,
    backgroundColor: `${colors.primary}12`,
  },
  refreshButtonDisabled: { opacity: 0.55 },
  refreshButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
  },
  unreadBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 12,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  markAllButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background.default,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.background.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingHorizontal: 20,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  tabBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  notificationCard: {
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: isDark
      ? '0 2px 4px rgba(0, 0, 0, 0.24)'
      : '0 2px 4px rgba(15, 23, 42, 0.08)',
    borderWidth: 1,
    borderColor: colors.divider,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
    zIndex: 10,
  },
  unreadNotification: {
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    backgroundColor: isDark ? 'rgba(0, 122, 255, 0.05)' : 'rgba(0, 122, 255, 0.03)',
  },
  readNotification: {
    opacity: 0.5,
    backgroundColor: colors.background.paper,
  },
  notificationContent: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  unreadIconContainer: {
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 2,
    borderColor: colors.background.paper,
  },
  notificationText: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markReadButtonInline: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
  },
  unreadText: {
    fontWeight: '700',
    color: colors.text.primary,
  },
  readText: {
    fontWeight: '500',
    color: colors.text.secondary,
  },
  urgentBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  urgentText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  notificationMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  unreadMessage: {
    color: colors.text.primary,
    fontWeight: '500',
  },
  readMessage: {
    color: colors.text.secondary,
    fontWeight: '400',
  },
  notificationTime: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  conversationSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 7,
  },
  conversationSummaryText: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 8,
  },
  bottomActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  markReadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    gap: 6,
  },
  markReadButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#007AFF',
  },
  toggleReadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    gap: 6,
  },
  toggleReadButtonRead: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
  },
  toggleReadButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#007AFF',
  },
  archiveButtonBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
    gap: 6,
  },
  archiveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  archiveButtonTextActive: {
    color: '#007AFF',
  },
  deleteButton: {
    padding: 6,
    borderRadius: 6,
  },
});
