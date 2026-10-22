import type { Notification } from '../contexts/NotificationContext';

// Session-only inbox entries, kept outside React so the root and dashboard
// NotificationProviders show the same list. Nothing here reaches the server.
export const LOCAL_NOTIFICATION_PREFIX = 'local-';
const MAX_LOCAL_NOTIFICATIONS = 20;

type Listener = () => void;
let entries: Notification[] = [];
const listeners = new Set<Listener>();

const commit = (next: Notification[]) => {
  entries = next;
  listeners.forEach(listener => listener());
};

export const isLocalNotification = (id: string) => id.startsWith(LOCAL_NOTIFICATION_PREFIX);
export const getLocalNotifications = () => entries;
export const subscribeLocalNotifications = (listener: Listener) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function addLocalNotification(input: { title: string; message?: string; is_urgent?: boolean }) {
  const message = input.message ?? '';
  // A repeat of an unread alert would only stack identical rows.
  if (entries.some(item => !item.is_read && item.title === input.title && item.message === message)) return;
  const entry: Notification = {
    id: `${LOCAL_NOTIFICATION_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'system_alert',
    title: input.title,
    message,
    is_read: false,
    is_urgent: input.is_urgent ?? false,
    created_at: new Date().toISOString(),
  };
  commit([entry, ...entries].slice(0, MAX_LOCAL_NOTIFICATIONS));
}

export function updateLocalNotification(id: string, patch: Partial<Notification>) {
  commit(entries.map(item => (item.id === id ? { ...item, ...patch } : item)));
}

export function removeLocalNotification(id: string) {
  commit(entries.filter(item => item.id !== id));
}

export function markAllLocalNotificationsRead() {
  const readAt = new Date().toISOString();
  commit(entries.map(item => ({ ...item, is_read: true, read_at: readAt })));
}

export function resetLocalNotifications() {
  commit([]);
}
