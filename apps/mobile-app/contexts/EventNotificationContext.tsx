import React, { createContext, useContext, useState, useEffect } from 'react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  timestamp: Date;
  read: boolean;
}

interface EventNotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

const EventNotificationContext = createContext<EventNotificationContextType | undefined>(undefined);

export function EventNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Demo notifications for BSL 2025
  useEffect(() => {
    const demoNotifications: Notification[] = [
      {
        id: '1',
        title: 'Welcome to BSL 2025!',
        message: 'The Blockchain Summit Latam 2025 is starting soon. Get ready for an amazing experience!',
        type: 'info',
        timestamp: new Date(),
        read: false,
      },
      {
        id: '2',
        title: 'Speaker Session Starting',
        message: 'Keynote session with Rodrigo Sainz is starting in 15 minutes at Main Hall.',
        type: 'warning',
        timestamp: new Date(Date.now() - 300000), // 5 minutes ago
        read: false,
      },
      {
        id: '3',
        title: 'Networking Break',
        message: 'Coffee break is now available. Connect with other attendees in the networking area.',
        type: 'success',
        timestamp: new Date(Date.now() - 600000), // 10 minutes ago
        read: true,
      },
    ];
    setNotifications(demoNotifications);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(notification =>
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(notification => ({ ...notification, read: true }))
    );
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  return (
    <EventNotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotifications,
      }}
    >
      {children}
    </EventNotificationContext.Provider>
  );
}

export function useEventNotifications() {
  const context = useContext(EventNotificationContext);
  if (context === undefined) {
    throw new Error('useEventNotifications must be used within an EventNotificationProvider');
  }
  return context;
}
