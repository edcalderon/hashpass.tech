import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, ScrollView, Text, TouchableOpacity } from 'react-native';

const mockMarkAllAsRead = jest.fn();
const mockMarkAsRead = jest.fn().mockResolvedValue(undefined);
const mockMarkAsUnread = jest.fn().mockResolvedValue(undefined);
const mockArchiveNotification = jest.fn().mockResolvedValue(undefined);
const mockDeleteNotification = jest.fn().mockResolvedValue(undefined);
const mockRouterPush = jest.fn();
const mockMarketingPost = jest.fn().mockResolvedValue({ success: true });
type TestNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  meeting_request_id?: string;
  meeting_request_event_id?: string;
  meeting_id?: string;
  campaign_id?: string;
  is_urgent?: boolean;
  is_archived?: boolean;
  is_read: boolean;
  created_at: string;
};
const defaultNotification: TestNotification = {
  id: 'n1', type: 'meeting_update', title: 'Hi', message: 'm', is_read: false, is_urgent: false,
  created_at: '2026-01-01T00:00:00Z',
};
const mockNotifications: TestNotification[] = [
  defaultNotification,
];
const mockPassInfo = {
  pass_id: 'p1', pass_type: 'general', status: 'active', pass_number: '7',
  max_requests: 10, used_requests: 2, remaining_requests: 8,
  max_boost: 5, used_boost: 1, remaining_boost: 4,
  access_features: ['networking'], special_perks: ['lounge'], event_id: 'e1',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ passId: 'p1' }),
}));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: '#a00', primaryContrastText: '#fff', divider: '#ddd', error: '#f00',
      background: { paper: '#fafafa', default: '#fff' }, text: { primary: '#111', secondary: '#555' },
    },
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key) }),
}));
jest.mock('../../lib/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialIcons: 'MaterialIcons' }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/api-client', () => ({ apiClient: { post: (...args: unknown[]) => mockMarketingPost(...args) } }));
jest.mock('../../hooks/useAuth', () => {
  const auth = { user: { id: 'u1' }, dbUserId: 'db1', isLoading: false };
  return { useAuth: () => auth };
});
jest.mock('../../components/UnifiedSearchAndFilter', () => 'SearchAndFilter');
jest.mock('../../components/DynamicQRDisplay', () => 'DynamicQR');
jest.mock('@contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: 1,
    isLoading: false,
    markAsRead: mockMarkAsRead,
    markAsUnread: mockMarkAsUnread,
    markAllAsRead: mockMarkAllAsRead,
    archiveNotification: mockArchiveNotification,
    deleteNotification: mockDeleteNotification,
    refreshNotifications: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('../../lib/pass-system', () => ({
  passSystemService: {
    getUserPassInfo: jest.fn(async () => mockPassInfo),
    getPassTypeDisplayName: () => 'General',
  },
}));
jest.mock('../../contexts/ToastContext', () => ({
  useToastHelpers: () => ({ showSuccess: jest.fn(), showError: jest.fn() }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

import Notifications from '../../app/(shared)/dashboard/notifications';
import QRView from '../../app/(shared)/dashboard/qr-view';
import PassDetails from '../../app/(shared)/dashboard/pass-details';

const text = (view: ReactTestRenderer) => view.root
  .findAllByType(Text)
  .map(node => [node.props.children].flat().join(''))
  .join('|');

describe('dashboard pages share the page layout', () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
    mockMarkAllAsRead.mockReset();
    mockMarkAsRead.mockReset();
    mockMarkAsUnread.mockReset();
    mockArchiveNotification.mockReset();
    mockDeleteNotification.mockReset();
    mockMarketingPost.mockReset().mockResolvedValue({ success: true });
    (Alert.alert as jest.Mock).mockClear();
    mockNotifications.splice(0, mockNotifications.length, defaultNotification);
  });

  it('notifications: wallet-style heading, pill tabs, and tab switching', () => {
    let view!: ReactTestRenderer;
    act(() => { view = create(<Notifications />); });
    expect(text(view)).toContain('YOUR INBOX');
    const tabs = () => view.root.findAll(n => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');
    expect(tabs().length).toBeGreaterThanOrEqual(4);
    const tablist = view.root.find(n => n.props.accessibilityRole === 'tablist');
    const trackStyles = Array.isArray(tablist.props.style)
      ? tablist.props.style.flat(Infinity)
      : [tablist.props.style];
    expect(trackStyles).toContainEqual(expect.objectContaining({ flexWrap: 'nowrap' }));
    expect(view.root.findAllByType(ScrollView).some(node => node.props.horizontal)).toBe(true);
    act(() => { tabs()[1].props.onPress(); });
    expect(tabs()[1].props.accessibilityState.selected).toBe(true);
    const markAll = view.root.findAll(n => n.props.accessibilityRole === 'button')
      .find(n => n.props.onPress === mockMarkAllAsRead);
    expect(markAll).toBeTruthy();
    act(() => { markAll!.props.onPress(); });
    expect(mockMarkAllAsRead).toHaveBeenCalled();
    act(() => view.unmount());
  });

  it('renders grouped, urgent, read, and archived notifications with their actions', async () => {
    mockNotifications.splice(
      0,
      mockNotifications.length,
      {
        id: 'chat-unread', type: 'chat_message', title: 'New message', message: 'Hello',
        meeting_id: 'meeting-1', is_read: false, is_urgent: false, created_at: '2026-01-03T00:00:00Z',
      },
      {
        id: 'chat-read', type: 'chat_message', title: 'Earlier message', message: 'Hi',
        meeting_id: 'meeting-1', is_read: true, is_urgent: false, created_at: '2026-01-02T00:00:00Z',
      },
      {
        id: 'urgent-read', type: 'meeting_accepted', title: 'Meeting accepted', message: 'Accepted',
        is_read: true, is_urgent: true, created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'archived-item', type: 'meeting_request', title: 'Archived request', message: 'Archived',
        is_read: true, is_urgent: false, is_archived: true, created_at: '2025-12-31T00:00:00Z',
      },
    );

    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Notifications />); });

    expect(text(view)).toContain('1 unread in this conversation');
    expect(text(view)).toContain('center.urgent');

    const markRead = view.root.find(node => node.props.accessibilityLabel === 'center.markRead');
    await act(async () => { await markRead.props.onPress(); });
    expect(mockMarkAsRead).toHaveBeenCalledWith('chat-unread');
    expect(mockMarkAsRead).toHaveBeenCalledWith('chat-read');

    const markUnread = view.root.find(node => node.props.accessibilityLabel === 'center.markUnread');
    await act(async () => { await markUnread.props.onPress(); });
    expect(mockMarkAsUnread).toHaveBeenCalledWith('urgent-read');

    const archive = view.root.findAll(node => node.props.accessibilityLabel === 'center.archive')[0];
    await act(async () => { await archive.props.onPress(); });
    expect(mockArchiveNotification).toHaveBeenCalled();

    const tabs = view.root.findAll(node => node.props.accessibilityRole === 'tab');
    await act(async () => { tabs[3].props.onPress(); });
    const remove = view.root.find(node => node.props.accessibilityLabel === 'center.delete');
    await act(async () => { await remove.props.onPress(); });
    expect(Alert.alert).toHaveBeenCalledWith(
      'center.deleteTitle',
      'center.deleteMessage',
      expect.arrayContaining([expect.objectContaining({ text: 'center.delete', style: 'destructive' })]),
    );
    const deleteOptions = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2];
    await act(async () => { await deleteOptions[1].onPress(); });
    expect(mockDeleteNotification).toHaveBeenCalledWith('archived-item');
    act(() => view.unmount());
  });

  it('opens a meeting request in the event resolved from its notification', async () => {
    mockNotifications[0] = {
      id: 'request-notification',
      type: 'meeting_request_created',
      title: 'Meeting request',
      message: 'A speaker sent a request',
      meeting_request_id: 'request-1',
      meeting_request_event_id: 'event-from-request',
      is_read: false,
      created_at: '2026-01-02T00:00:00Z',
    };

    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Notifications />); });
    const requestCard = view.root.findAllByType(TouchableOpacity)
      .find(node => node.props.activeOpacity === 0.7);
    expect(requestCard).toBeTruthy();

    await act(async () => { await requestCard!.props.onPress(); });

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/events/event-from-request/networking/my-requests',
      params: { requestId: 'request-1', highlightRequest: 'true' },
    });
    act(() => view.unmount());
  });

  it('lets the assigned campaign reviewer approve or decline from the notification', async () => {
    mockNotifications.splice(0, mockNotifications.length, {
      id: 'campaign-approval',
      type: 'marketing_campaign_approval_requested',
      title: 'Campaign approval requested',
      message: 'BSL Colombia · 100% Business Experience offer · Code HASHPASS · Nov 3 at 07:35 Bogotá · opted-in audience only.',
      campaign_id: 'campaign-1',
      is_read: false,
      is_urgent: true,
      created_at: '2026-11-02T05:00:00Z',
    });
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Notifications />); });
    expect(text(view)).toContain('Code HASHPASS');
    const approve = view.root.find(node => node.props.accessibilityLabel === 'center.approveCampaign');
    await act(async () => { approve.props.onPress(); });
    const confirmApproval = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2][1];
    await act(async () => { confirmApproval.onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(mockMarketingPost).toHaveBeenCalledWith('admin/marketing', { action: 'approve', id: 'campaign-1' }, { skipEventSegment: true, retries: 0 });
    expect(mockMarkAsRead).toHaveBeenCalledWith('campaign-approval');
    expect(mockRouterPush).not.toHaveBeenCalled();
    act(() => view.unmount());
  });

  it('qr-view renders the pass inside the shared column', async () => {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<QRView />); });
    expect(view.root.findAllByType('DynamicQR' as any).length).toBeGreaterThan(0);
    act(() => view.unmount());
  });

  it('pass-details renders the pass inside the shared column', async () => {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<PassDetails />); });
    expect(view.root.findAllByType('DynamicQR' as any).length).toBeGreaterThan(0);
    act(() => view.unmount());
  });
});
