import type { Notification } from '../contexts/NotificationContext';

export type NotificationInboxTab = 'all' | 'messages' | 'updates' | 'archive';

export type NotificationInboxItem = Notification & {
  notificationIds: string[];
  notificationCount: number;
  unreadMessageCount: number;
};

const isChatNotification = (notification: Notification) => notification.type === 'chat_message';

export function getNotificationsForInboxTab(
  notifications: Notification[],
  tab: NotificationInboxTab,
): Notification[] {
  if (tab === 'archive') return notifications.filter((notification) => notification.is_archived === true);
  if (tab === 'messages') return notifications.filter((notification) => !notification.is_archived && isChatNotification(notification));
  if (tab === 'updates') return notifications.filter((notification) => !notification.is_archived && !isChatNotification(notification));
  return notifications.filter((notification) => !notification.is_archived);
}

/** Groups message alerts by meeting so a busy chat appears as one inbox item. */
export function groupChatNotifications(notifications: Notification[]): NotificationInboxItem[] {
  const groups = new Map<string, NotificationInboxItem>();

  for (const notification of notifications) {
    if (!isChatNotification(notification)) {
      groups.set(`notification:${notification.id}`, {
        ...notification,
        notificationIds: [notification.id],
        notificationCount: 1,
        unreadMessageCount: notification.is_read ? 0 : 1,
      });
      continue;
    }

    const conversationId = notification.meeting_id || notification.speaker_id || notification.id;
    const key = `chat:${conversationId}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...notification,
        notificationIds: [notification.id],
        notificationCount: 1,
        unreadMessageCount: notification.is_read ? 0 : 1,
      });
      continue;
    }

    existing.notificationIds.push(notification.id);
    existing.notificationCount += 1;
    existing.unreadMessageCount += notification.is_read ? 0 : 1;
    existing.is_read = existing.unreadMessageCount === 0;
  }

  return [...groups.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
