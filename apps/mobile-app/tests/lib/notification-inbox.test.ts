/// <reference types="jest" />

import { getNotificationsForInboxTab, groupChatNotifications } from '../../lib/notification-inbox';
import type { Notification } from '../../contexts/NotificationContext';

const createNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'notification-1',
  type: 'chat_message',
  title: 'New Chat Message',
  message: 'Edward sent you a message.',
  is_read: false,
  is_urgent: false,
  created_at: '2026-08-02T10:00:00.000Z',
  meeting_id: 'meeting-1',
  ...overrides,
});

describe('notification inbox', () => {
  it('separates active messages, updates, and archived notifications', () => {
    const notifications = [
      createNotification(),
      createNotification({ id: 'meeting', type: 'meeting_request', meeting_id: undefined }),
      createNotification({ id: 'archived', is_archived: true }),
    ];

    expect(getNotificationsForInboxTab(notifications, 'messages')).toHaveLength(1);
    expect(getNotificationsForInboxTab(notifications, 'updates')).toHaveLength(1);
    expect(getNotificationsForInboxTab(notifications, 'archive')).toHaveLength(1);
    expect(getNotificationsForInboxTab(notifications, 'all')).toHaveLength(2);
  });

  it('groups message notifications for the same meeting and retains their unread count', () => {
    const inbox = groupChatNotifications([
      createNotification({ id: 'latest', created_at: '2026-08-02T11:00:00.000Z' }),
      createNotification({ id: 'earlier', is_read: true, created_at: '2026-08-02T10:00:00.000Z' }),
      createNotification({ id: 'update', type: 'meeting_request', meeting_id: undefined }),
    ]);

    expect(inbox).toHaveLength(2);
    expect(inbox[0]).toMatchObject({
      id: 'latest',
      notificationIds: ['latest', 'earlier'],
      notificationCount: 2,
      unreadMessageCount: 1,
      is_read: false,
    });
  });
});
