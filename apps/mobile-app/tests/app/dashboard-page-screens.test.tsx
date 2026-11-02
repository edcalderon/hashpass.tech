import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, ScrollView, Text, TouchableOpacity } from 'react-native';

const mockMarkAllAsRead = jest.fn();
const mockMarkAsRead = jest.fn().mockResolvedValue(undefined);
const mockMarkAsUnread = jest.fn().mockResolvedValue(undefined);
const mockArchiveNotification = jest.fn().mockResolvedValue(undefined);
const mockDeleteNotification = jest.fn().mockResolvedValue(undefined);
const mockRefreshNotifications = jest.fn().mockResolvedValue(undefined);
const mockRouterPush = jest.fn();
const mockMarketingPost = jest.fn().mockResolvedValue({ success: true });
const mockFilterLogic: { current?: (data: any[], filters: Record<string, any>, query: string) => any[] } = {};
type TestNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  meeting_request_id?: string;
  meeting_request_event_id?: string;
  meeting_id?: string;
  campaign_id?: string;
  event_id?: string;
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
jest.mock('../../components/UnifiedSearchAndFilter', () => (props: any) => {
  mockFilterLogic.current = props.customFilterLogic;
  return null;
});
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
    refreshNotifications: mockRefreshNotifications,
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
    mockRefreshNotifications.mockReset().mockResolvedValue(undefined);
    mockFilterLogic.current = undefined;
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

  it('opens ticket-claim review notifications directly in the Ticket Claims tab', async () => {
    mockNotifications.splice(0, mockNotifications.length, {
      id: 'review-notification', type: 'ticket_claim_review_required', title: 'Needs review', message: 'Review details', event_id: 'colombia2026',
      is_read: false, created_at: '2026-11-02T00:00:00Z',
    });
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Notifications />); });
    const card = view.root.findAllByType(TouchableOpacity).find(node => node.props.activeOpacity === 0.7);
    expect(card).toBeTruthy();
    await act(async () => { await card!.props.onPress(); });
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/dashboard/admin',
      params: { tab: 'ticket-claims', eventId: 'colombia2026' },
    });
    act(() => view.unmount());
  });

  it('opens campaign approval notifications in Admin', async () => {
    mockNotifications.splice(0, mockNotifications.length, {
      id: 'campaign-review-notification', type: 'marketing_campaign_approval_requested', title: 'Needs review', message: 'Review details', campaign_id: 'campaign-1',
      is_read: false, created_at: '2026-11-02T00:00:00Z',
    });
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Notifications />); });
    const card = view.root.findAllByType(TouchableOpacity).find(node => node.props.activeOpacity === 0.7);
    expect(card).toBeTruthy();
    await act(async () => { await card!.props.onPress(); });
    expect(mockRouterPush).toHaveBeenCalledWith('/dashboard/admin');
    act(() => view.unmount());
  });

  it('lets the assigned campaign reviewer approve or decline from the notification', async () => {
    const confirm = jest.fn().mockReturnValue(true);
    const alert = jest.fn();
    const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm');
    const originalAlert = Object.getOwnPropertyDescriptor(window, 'alert');
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm });
    Object.defineProperty(window, 'alert', { configurable: true, value: alert });
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
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm);
    else Reflect.deleteProperty(window, 'confirm');
    if (originalAlert) Object.defineProperty(window, 'alert', originalAlert);
    else Reflect.deleteProperty(window, 'alert');
    expect(confirm).toHaveBeenCalledWith('center.approveCampaignTitle\n\ncenter.approveCampaignMessage');
    expect(alert).toHaveBeenCalledWith('center.campaignDecisionSavedTitle\n\ncenter.campaignApprovedMessage');
    expect(mockMarketingPost).toHaveBeenCalledWith('admin/marketing', { action: 'approve', id: 'campaign-1' }, { skipEventSegment: true, retries: 0 });
    expect(mockMarkAsRead).toHaveBeenCalledWith('campaign-approval');
    expect(mockRouterPush).not.toHaveBeenCalled();
    act(() => view.unmount());
  });

  it('filters all campaign lifecycle notifications together', () => {
    let view!: ReactTestRenderer;
    act(() => { view = create(<Notifications />); });
    const campaign = { type: 'marketing_campaign_approval_requested' };
    const approved = { type: 'marketing_campaign_approved' };
    const cancelled = { type: 'marketing_campaign_cancelled' };
    const unrelated = { type: 'system_alert' };
    expect(mockFilterLogic.current!([campaign, approved, cancelled, unrelated], { type: 'campaign_approval' }, ''))
      .toEqual([campaign, approved, cancelled]);
    expect(mockFilterLogic.current!([campaign, unrelated], { type: 'system_alert' }, ''))
      .toEqual([unrelated]);
    expect(mockFilterLogic.current!([campaign, unrelated], {}, '')).toEqual([campaign, unrelated]);
    act(() => view.unmount());
  });

  it('uses campaign lifecycle icons and reports failed reviewer decisions', async () => {
    const confirm = jest.fn().mockReturnValue(true);
    const alert = jest.fn();
    const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm');
    const originalAlert = Object.getOwnPropertyDescriptor(window, 'alert');
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm });
    Object.defineProperty(window, 'alert', { configurable: true, value: alert });
    mockNotifications.splice(0, mockNotifications.length,
      { id: 'approval', type: 'marketing_campaign_approval_requested', title: 'Approval', message: 'Review', campaign_id: 'c1', is_read: false, created_at: '2026-11-02T00:00:00Z' },
      { id: 'approved', type: 'marketing_campaign_approved', title: 'Approved', message: 'Approved', is_read: false, created_at: '2026-11-02T00:00:00Z' },
      { id: 'declined', type: 'marketing_campaign_declined', title: 'Declined', message: 'Declined', is_read: false, created_at: '2026-11-02T00:00:00Z' },
      { id: 'cancelled', type: 'marketing_campaign_cancelled', title: 'Cancelled', message: 'Cancelled', is_read: false, created_at: '2026-11-02T00:00:00Z' },
    );
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Notifications />); });
    const icons = view.root.findAll(node => String(node.type) === 'MaterialIcons').map(node => node.props.name);
    expect(icons).toContain('verified-user');
    expect(icons).toContain('verified');
    expect(icons).toContain('schedule');
    expect(icons).toContain('cancel');

    mockMarketingPost.mockResolvedValueOnce({ success: false, error: 'Campaign is no longer pending' });
    const decline = view.root.find(node => node.props.accessibilityLabel === 'center.declineCampaign');
    await act(async () => { decline.props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(mockMarketingPost).toHaveBeenCalledWith('admin/marketing', { action: 'decline', id: 'c1' }, { skipEventSegment: true, retries: 0 });
    expect(alert).toHaveBeenCalledWith('center.campaignDecisionFailed\n\nCampaign is no longer pending');

    mockMarketingPost.mockResolvedValueOnce({ success: false });
    await act(async () => { view.root.find(node => node.props.accessibilityLabel === 'center.declineCampaign').props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(alert).toHaveBeenLastCalledWith('center.campaignDecisionFailed\n\ncenter.campaignDecisionFailed');

    mockMarketingPost.mockResolvedValueOnce({ success: true });
    await act(async () => { view.root.find(node => node.props.accessibilityLabel === 'center.declineCampaign').props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(alert).toHaveBeenLastCalledWith('center.campaignDecisionSavedTitle\n\ncenter.campaignDeclinedMessage');
    expect(mockMarkAsRead).toHaveBeenCalledWith('approval');

    mockMarketingPost.mockRejectedValueOnce('unexpected rejection');
    const approve = view.root.find(node => node.props.accessibilityLabel === 'center.approveCampaign');
    await act(async () => { approve.props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(alert).toHaveBeenLastCalledWith('center.campaignDecisionFailed\n\ncenter.campaignDecisionFailed');
    if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm);
    else Reflect.deleteProperty(window, 'confirm');
    if (originalAlert) Object.defineProperty(window, 'alert', originalAlert);
    else Reflect.deleteProperty(window, 'alert');
    act(() => view.unmount());
  });

  it('ignores duplicate taps while a campaign decision is in flight', async () => {
    const confirm = jest.fn().mockReturnValue(true);
    const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm');
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm });
    mockNotifications.splice(0, mockNotifications.length, {
      id: 'pending-approval', type: 'marketing_campaign_approval_requested', title: 'Approval', message: 'Review',
      campaign_id: 'pending-campaign', is_read: false, created_at: '2026-11-02T00:00:00Z',
    });
    let finishRequest!: (value: { success: boolean }) => void;
    mockMarketingPost.mockImplementationOnce(() => new Promise(resolve => { finishRequest = resolve; }));
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Notifications />); });
    await act(async () => { view.root.find(node => node.props.accessibilityLabel === 'center.approveCampaign').props.onPress(); await Promise.resolve(); });
    await act(async () => { view.root.find(node => node.props.accessibilityLabel === 'center.approveCampaign').props.onPress(); });
    expect(mockMarketingPost).toHaveBeenCalledTimes(1);
    await act(async () => { finishRequest({ success: true }); await Promise.resolve(); await Promise.resolve(); });
    if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm);
    else Reflect.deleteProperty(window, 'confirm');
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
