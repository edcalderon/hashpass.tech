import {
  addLocalNotification,
  getLocalNotifications,
  isLocalNotification,
  markAllLocalNotificationsRead,
  removeLocalNotification,
  resetLocalNotifications,
  subscribeLocalNotifications,
  updateLocalNotification,
} from '../../lib/local-notifications';

describe('local notifications', () => {
  beforeEach(() => resetLocalNotifications());

  it('adds an unread system alert, ignores an identical unread repeat, and notifies subscribers', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeLocalNotifications(listener);
    addLocalNotification({ title: 'Could not save', message: 'Try again', is_urgent: true });
    addLocalNotification({ title: 'Could not save', message: 'Try again' });
    const [entry] = getLocalNotifications();
    expect(getLocalNotifications()).toHaveLength(1);
    expect(entry).toMatchObject({ type: 'system_alert', title: 'Could not save', message: 'Try again', is_read: false, is_urgent: true });
    expect(isLocalNotification(entry.id)).toBe(true);
    expect(isLocalNotification('3f2a')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    addLocalNotification({ title: 'Other' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('marks read, allows a repeat once read, removes, and caps the list', () => {
    addLocalNotification({ title: 'A' });
    const id = getLocalNotifications()[0].id;
    updateLocalNotification(id, { is_read: true });
    addLocalNotification({ title: 'A' });
    expect(getLocalNotifications()).toHaveLength(2);
    markAllLocalNotificationsRead();
    expect(getLocalNotifications().every(item => item.is_read)).toBe(true);
    removeLocalNotification(id);
    expect(getLocalNotifications()).toHaveLength(1);
    for (let index = 0; index < 30; index += 1) addLocalNotification({ title: `Alert ${index}` });
    expect(getLocalNotifications()).toHaveLength(20);
  });
});
