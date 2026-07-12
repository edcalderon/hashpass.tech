import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n/i18n';
import { translateNotification } from '../lib/notification-translations';
import { buildEventPath } from '../lib/event-path';

export interface Notification {
  id: string;
  type: 'meeting_request' | 'meeting_accepted' | 'meeting_declined' | 'meeting_reminder' | 'meeting_expired' | 'meeting_cancelled' | 'boost_received' | 'system_alert' | 'chat_message';
  title: string;
  message: string;
  is_read: boolean;
  is_urgent: boolean;
  is_archived?: boolean;
  created_at: string;
  read_at?: string;
  archived_at?: string;
  meeting_request_id?: string;
  speaker_id?: string;
  meeting_id?: string;
}

export interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAsUnread: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  archiveNotification: (notificationId: string) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { t } = useTranslation();

  // Track current user ID to prevent unnecessary re-fetches
  const currentUserIdRef = useRef<string | null>(null);
  // The REAL Supabase auth.users(id) UUID for the current session, resolved
  // server-side (see lib/server/resolve-notification-identity.ts). This can
  // differ from `user.id` when the active session came from a non-Supabase
  // provider (e.g. Better Auth uses its own non-UUID id format). Used to
  // scope the realtime subscription filter correctly.
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  const unreadCount = notifications.filter(n => !n.is_read && !n.is_archived).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setResolvedUserId(null);
      setIsLoading(false);
      currentUserIdRef.current = null;
      return;
    }

    // Prevent fetching if user hasn't changed
    if (currentUserIdRef.current === user.id) {
      return;
    }

    currentUserIdRef.current = user.id;

    try {
      const response = await apiClient.get(
        'notifications',
        { params: { limit: 50 }, skipEventSegment: true }
      );

      if (!response.success || !response.data) {
        console.error('Error fetching notifications:', response.error);
        return;
      }

      const responseData = response.data as { data: Notification[]; resolvedUserId: string | null };
      setResolvedUserId(responseData.resolvedUserId);

      // Translate notifications
      const translatedNotifications = (responseData.data || []).map((notification: any) => {
        const translated = translateNotification(notification, t);
        return {
          ...notification,
          title: translated.title,
          message: translated.message
        } as Notification;
      });

      setNotifications(translatedNotifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, t]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user) return;

    try {
      const response = await apiClient.patch(
        `notifications/${notificationId}`,
        { is_read: true },
        { skipEventSegment: true }
      );

      if (!response.success) {
        console.error('Error marking notification as read:', response.error);
        return;
      }

      setNotifications(prev =>
        prev.map((notification: Notification) =>
          notification.id === notificationId
            ? { ...notification, is_read: true, read_at: new Date().toISOString() }
            : notification
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, [user]);

  const markAsUnread = useCallback(async (notificationId: string) => {
    if (!user) return;

    try {
      const response = await apiClient.patch(
        `notifications/${notificationId}`,
        { is_read: false },
        { skipEventSegment: true }
      );

      if (!response.success) {
        console.error('Error marking notification as unread:', response.error);
        return;
      }

      setNotifications(prev =>
        prev.map((notification: Notification) =>
          notification.id === notificationId
            ? { ...notification, is_read: false, read_at: undefined }
            : notification
        )
      );
    } catch (error) {
      console.error('Error marking notification as unread:', error);
    }
  }, [user]);

  const archiveNotification = useCallback(async (notificationId: string) => {
    if (!user) return;

    try {
      // Archive and mark as read in a single update
      const now = new Date().toISOString();
      const response = await apiClient.patch(
        `notifications/${notificationId}`,
        { is_archived: true },
        { skipEventSegment: true }
      );

      if (!response.success) {
        console.error('Error archiving notification:', response.error);
        return;
      }

      // Update local state
      setNotifications(prev =>
        prev.map((notification: Notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                is_read: true,
                read_at: now,
                is_archived: true,
                archived_at: now
              }
            : notification
        )
      );
    } catch (error) {
      console.error('Error archiving notification:', error);
    }
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    try {
      const response = await apiClient.patch('notifications', undefined, { skipEventSegment: true });

      if (!response.success) {
        console.error('Error marking all notifications as read:', response.error);
        return;
      }

      setNotifications(prev =>
        prev.map((notification: Notification) => ({
          ...notification,
          is_read: true,
          read_at: new Date().toISOString()
        }))
      );
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }, [user]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!user) return;

    try {
      const response = await apiClient.delete(`notifications/${notificationId}`, { skipEventSegment: true });

      if (!response.success) {
        console.error('Error deleting notification:', response.error);
        return;
      }

      setNotifications(prev =>
        prev.filter((notification: Notification) => notification.id !== notificationId)
      );
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }, [user]);

  const refreshNotifications = useCallback(async () => {
    setIsLoading(true);
    // Force refresh by resetting the user ID ref
    currentUserIdRef.current = null;
    await fetchNotifications();
  }, [fetchNotifications]);

  // Initial fetch + auto-refresh fallback. Realtime subscription (below)
  // depends on resolvedUserId, which this fetch populates.
  useEffect(() => {
    if (!user) return;
    fetchNotifications();
  }, [user, fetchNotifications]);

  // Set up real-time subscription — scoped to the resolved Supabase auth
  // UUID, not user.id, since user.id may be a non-Supabase provider id that
  // would never match the notifications.user_id column and silently receive
  // no events.
  useEffect(() => {
    if (!user || !resolvedUserId) return;

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${resolvedUserId}`,
        },
        (payload: any) => {
          console.log('New notification received:', payload);
          const newNotification = payload.new as Notification;

          // Translate the new notification
          const translated = translateNotification(newNotification, t);
          const translatedNotification = {
            ...newNotification,
            title: translated.title,
            message: translated.message
          };

          // Add to the beginning of the list
          setNotifications(prev => [translatedNotification, ...prev]);

          // Show browser notification if permission granted (web-only; Notification API doesn't exist on native)
          if (typeof window !== 'undefined' && typeof Notification !== 'undefined' && Notification.permission === 'granted' && newNotification.is_urgent) {
            const notificationOptions: NotificationOptions = {
              body: newNotification.message,
              icon: '/favicon.ico',
              tag: newNotification.id,
              badge: '/favicon.ico',
              requireInteraction: false,
            };

            // Add click handler for chat messages to navigate to meeting room
            const browserNotification = new window.Notification(newNotification.title, notificationOptions);

            browserNotification.onclick = () => {
              window.focus();
              // Navigate to meeting chat if it's a chat message
              if (newNotification.type === 'chat_message' && (newNotification as any).meeting_id) {
                const meetingId = (newNotification as any).meeting_id;
                window.location.href = `${buildEventPath(undefined, 'networking/meeting-detail')}?meetingId=${meetingId}&openChat=true`;
              }
              browserNotification.close();
            };
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${resolvedUserId}`,
        },
        (payload: any) => {
          console.log('Notification updated:', payload);
          const updatedNotification = payload.new as Notification;

          setNotifications(prev =>
            prev.map(notification =>
              notification.id === updatedNotification.id
                ? updatedNotification
                : notification
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${resolvedUserId}`,
        },
        (payload: any) => {
          console.log('Notification deleted:', payload);
          const deletedNotification = payload.old as Notification;

          setNotifications(prev =>
            prev.filter(notification => notification.id !== deletedNotification.id)
          );
        }
      )
      .subscribe();

    // Request notification permission (web-only)
    if (typeof window !== 'undefined' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, resolvedUserId]); // Only depend on identity to prevent re-subscription on other user changes

  // Auto-refresh notifications every 30 seconds as fallback
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only depend on user.id to prevent interval recreation

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    archiveNotification,
    deleteNotification,
    refreshNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
