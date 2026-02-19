import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n/i18n';
import { translateNotification } from '../lib/notification-translations';

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

  const unreadCount = notifications.filter(n => !n.is_read && !n.is_archived).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
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
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      // Translate notifications
      const translatedNotifications = (data || []).map((notification: any) => {
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
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error marking notification as read:', error);
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
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ 
          is_read: false, 
          read_at: null
        })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error marking notification as unread:', error);
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
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ 
          is_read: true,
          read_at: now,
          is_archived: true,
          archived_at: now
        })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error archiving notification:', error);
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
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) {
        console.error('Error marking all notifications as read:', error);
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
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting notification:', error);
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

  // Set up real-time subscription
  useEffect(() => {
    if (!user) return;

    // Initial fetch
    fetchNotifications();

    // Set up real-time subscription
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
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
          
          // Show browser notification if permission granted
          if (typeof window !== 'undefined' && Notification.permission === 'granted' && newNotification.is_urgent) {
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
                window.location.href = `/events/bsl2025/networking/meeting-detail?meetingId=${meetingId}&openChat=true`;
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
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
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
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Notification deleted:', payload);
          const deletedNotification = payload.old as Notification;
          
          setNotifications(prev => 
            prev.filter(notification => notification.id !== deletedNotification.id)
          );
        }
      )
      .subscribe();

    // Request notification permission (only in browser)
    if (typeof window !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only depend on user.id to prevent re-subscription on other user changes

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
