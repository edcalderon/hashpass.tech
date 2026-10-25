import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, useSyncExternalStore } from 'react';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n/i18n';
import { translateNotification } from '../lib/notification-translations';
import {
  getLocalNotifications,
  isLocalNotification,
  markAllLocalNotificationsRead,
  resetLocalNotifications,
  removeLocalNotification,
  subscribeLocalNotifications,
  updateLocalNotification,
} from '../lib/local-notifications';

export interface Notification {
  id: string;
  type: 'meeting_request' | 'meeting_accepted' | 'meeting_declined' | 'meeting_reminder' | 'meeting_expired' | 'meeting_cancelled' | 'meeting_slot_conflict' | 'boost_received' | 'system_alert' | 'chat_message' | 'business_invite_pending' | 'business_invite_review_required' | 'business_invite_approved' | 'business_invite_rejected';
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

// Fallback polling base/cap. Consecutive failures back off without opening a
// client-side database connection.
const NOTIFICATION_POLL_BASE_MS = 30_000;
const NOTIFICATION_POLL_MAX_MS = 5 * 60_000;

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
  const [serverNotifications, setNotifications] = useState<Notification[]>([]);
  const localNotifications = useSyncExternalStore<Notification[]>(subscribeLocalNotifications, getLocalNotifications, getLocalNotifications);
  const notifications = useMemo(
    () => [...localNotifications, ...serverNotifications].sort((first, second) => Date.parse(second.created_at) - Date.parse(first.created_at)),
    [localNotifications, serverNotifications],
  );
  const [isLoading, setIsLoading] = useState(true);
  const { user, dbUserId, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();

  // Track current user ID to prevent unnecessary re-fetches
  const currentUserIdRef = useRef<string | null>(null);
  // Client-side backoff prevents every open tab from hammering a struggling
  // API at the same fixed interval. The authenticated server boundary owns
  // database identity; the client never opens a database subscription.
  const consecutiveFailuresRef = useRef(0);
  const unreadCount = notifications.filter(n => !n.is_read && !n.is_archived).length;

  const recordFetchFailure = useCallback(() => {
    consecutiveFailuresRef.current += 1;
  }, []);

  const fetchNotifications = useCallback(async (force = false) => {
    // Better Auth can briefly expose a cached user while its cookie/session
    // bootstrap is still settling. Do not turn that transitional state into
    // a pair of protected requests that are guaranteed to race the session
    // cookie (and produce noisy 401s in the browser). The auth hook will
    // re-run this effect once the provider state is resolved.
    if (authLoading) return;

    if (!user) {
      setNotifications([]);
      resetLocalNotifications();
      setIsLoading(false);
      currentUserIdRef.current = null;
      return;
    }

    // Initial identity resolution may call this effect more than once. Keep
    // that path quiet, but let explicit and timed refreshes fetch new rows.
    if (!force && currentUserIdRef.current === user.id) {
      return;
    }

    try {
      // Fetch chat messages and event/system updates independently. Grouping
      // chats is intentionally a presentation concern, so it must not happen
      // after a single combined limit has already hidden older updates.
      const [messagesResponse, updatesResponse] = await Promise.all([
        apiClient.get('notifications', { params: { limit: 50, category: 'messages' }, skipEventSegment: true }),
        apiClient.get('notifications', { params: { limit: 50, category: 'updates' }, skipEventSegment: true }),
      ]);

      if (!messagesResponse.success || !messagesResponse.data || !updatesResponse.success || !updatesResponse.data) {
        console.error('Error fetching notifications:', messagesResponse.error || updatesResponse.error);
        recordFetchFailure();
        return;
      }

      consecutiveFailuresRef.current = 0;

      // Only lock in "already fetched for this user" on success. Right
      // after a fresh Better Auth sign-in, `user` is truthy before the
      // Supabase session bridge has landed, so there's no usable auth token
      // yet and this request genuinely fails ("No authorization token
      // provided"). Setting the ref before/regardless of the outcome meant
      // that failure was permanent for the rest of the session -- the
      // effect below now retries once the bridge lands (dbUserId changes),
      // but only this success-only guard lets that retry actually happen
      // instead of silently no-op'ing because user.id hasn't changed.
      currentUserIdRef.current = user.id;

      const messagesData = messagesResponse.data as { data: Notification[]; resolvedUserId: string | null };
      const updatesData = updatesResponse.data as { data: Notification[]; resolvedUserId: string | null };

      // Translate notifications
      const translatedNotifications = [...(messagesData.data || []), ...(updatesData.data || [])]
        .sort((first, second) => Date.parse(second.created_at) - Date.parse(first.created_at))
        .map((notification: any) => {
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
      recordFetchFailure();
    } finally {
      setIsLoading(false);
    }
  }, [authLoading, user, t, recordFetchFailure]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (isLocalNotification(notificationId)) {
      updateLocalNotification(notificationId, { is_read: true, read_at: new Date().toISOString() });
      return;
    }
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
    if (isLocalNotification(notificationId)) {
      updateLocalNotification(notificationId, { is_read: false, read_at: undefined });
      return;
    }
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
    if (isLocalNotification(notificationId)) {
      updateLocalNotification(notificationId, { is_read: true, is_archived: true, archived_at: new Date().toISOString() });
      return;
    }
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
    markAllLocalNotificationsRead();
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
    if (isLocalNotification(notificationId)) {
      removeLocalNotification(notificationId);
      return;
    }
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
    await fetchNotifications(true);
  }, [fetchNotifications]);

  // Initial fetch + auto-refresh uses the authenticated API boundary. dbUserId
  // is included so the bridge refreshes the cookie-backed identity once its
  // Supabase session lands, and transient failures can recover for the current
  // session through the success-only ref guard above.

  useEffect(() => {
    if (authLoading) return;
    fetchNotifications();
  }, [authLoading, user, fetchNotifications, dbUserId]);

  // Notifications intentionally stay behind the authenticated API boundary.
  // The bounded polling fallback below replaces the fragile browser-side
  // Supabase postgres_changes socket, preventing binding races and the
  // invalid cross-domain cookie warning emitted by that websocket in local
  // web builds.
  // Auto-refresh notifications as a fallback, with exponential backoff on
  // consecutive failures (capped at NOTIFICATION_POLL_MAX_MS) instead of a
  // fixed 30s interval -- a fixed interval kept hammering an already-failing
  // backend at full frequency during the real incident this guards against.
  useEffect(() => {
    if (authLoading || !user) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const scheduleNext = () => {
      const failures = consecutiveFailuresRef.current;
      const delay = Math.min(NOTIFICATION_POLL_BASE_MS * Math.pow(2, failures), NOTIFICATION_POLL_MAX_MS);
      timeoutId = setTimeout(async () => {
        if (cancelled) return;
        await fetchNotifications(true);
        if (!cancelled) scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, fetchNotifications]); // Only depend on identity + the fetch fn to prevent timer-chain recreation on other user changes

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
