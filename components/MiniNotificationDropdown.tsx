import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useNotifications } from '../contexts/NotificationContext';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n/i18n';
import { translateNotification } from '../lib/notification-translations';

interface MiniNotificationDropdownProps {
  onNotificationPress?: () => void;
}

export default function MiniNotificationDropdown({ onNotificationPress }: MiniNotificationDropdownProps) {
  const { colors, isDark } = useTheme();
  const { notifications, unreadCount } = useNotifications();
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation('notifications');
  const [isOpen, setIsOpen] = useState(false);
  const [lastSeenUnreadCount, setLastSeenUnreadCount] = useState(0);
  const styles = getStyles(isDark, colors);

  // Track unread count when dropdown is opened to hide badge
  useEffect(() => {
    if (isOpen) {
      setLastSeenUnreadCount(unreadCount);
    }
  }, [isOpen]);

  // Calculate display badge count (only show if there are new notifications since last open)
  const displayBadgeCount = unreadCount > lastSeenUnreadCount ? unreadCount - lastSeenUnreadCount : 0;

  // Get recent unread notifications (max 5)
  const recentNotifications = notifications
    .filter(n => !n.is_read && !n.is_archived)
    .slice(0, 5);

  const handleNotificationClick = async (notification: any) => {
    setIsOpen(false);
    if (onNotificationPress) {
      onNotificationPress();
    }
    
    // Always navigate to notification center first
    // The notification center will handle marking as read and navigation to the actual action
    router.push({
      pathname: '/dashboard/notifications' as any,
      params: {
        notificationId: notification.id,
        highlightNotification: 'true'
      }
    });
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

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'chat_message':
        return 'chat';
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

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => setIsOpen(!isOpen)}
        activeOpacity={0.8}
      >
        <MaterialIcons 
          name="notifications" 
          size={26} 
          color={isDark ? '#FFFFFF' : '#000000'} 
        />
        {displayBadgeCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {displayBadgeCount > 9 ? '9+' : displayBadgeCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {isOpen && (
        <Modal
          visible={isOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsOpen(false)}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setIsOpen(false)}
          />
          <View style={styles.dropdown}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>{t('center.title')}</Text>
              {unreadCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{unreadCount}</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsOpen(false)}
              >
                <MaterialIcons name="close" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.notificationsList}
              showsVerticalScrollIndicator={false}
            >
              {recentNotifications.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="notifications-none" size={48} color={colors.text.secondary} />
                  <Text style={styles.emptyText}>{t('center.noNewNotifications')}</Text>
                </View>
              ) : (
                recentNotifications.map((notification) => {
                  // Translate notification to interpolate {requesterName} and other parameters
                  const translatedNotification = translateNotification(notification, t);
                  
                  return (
                    <TouchableOpacity
                      key={notification.id}
                      style={styles.notificationItem}
                      onPress={() => handleNotificationClick(notification)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.notificationIcon}>
                        <MaterialIcons 
                          name={getNotificationIcon(notification.type) as any} 
                          size={20} 
                          color={colors.primary} 
                        />
                      </View>
                      <View style={styles.notificationContent}>
                        <Text style={styles.notificationTitle} numberOfLines={1}>
                          {translatedNotification.title}
                        </Text>
                        <Text style={styles.notificationMessage} numberOfLines={2}>
                          {translatedNotification.message}
                        </Text>
                        <Text style={styles.notificationTime}>
                          {formatTimeAgo(notification.created_at)}
                        </Text>
                      </View>
                      {notification.is_urgent && (
                        <View style={styles.urgentDot} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={() => {
                setIsOpen(false);
                router.push('/dashboard/notifications');
              }}
            >
              <Text style={styles.viewAllText}>
                {recentNotifications.length > 0 ? t('center.viewAll') : t('center.goToCenter')}
              </Text>
              <MaterialIcons name="arrow-forward" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    position: 'relative',
  },
  iconButton: {
    position: 'relative',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: isDark ? colors.background.default : '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  dropdown: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 320,
    maxHeight: 500,
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.2)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  dropdownTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  headerBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  notificationsList: {
    maxHeight: 400,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.text.secondary,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    position: 'relative',
  },
  notificationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  urgentDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginRight: 4,
  },
});

