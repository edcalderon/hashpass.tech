/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockApiRequest = jest.fn();
const mockShowError = jest.fn();
const mockRefreshNotifications = jest.fn();
const mockRouterPush = jest.fn();
let mockDbUserId: string | null = 'user-123';
let mockParams: Record<string, string | undefined> = {};

const mockColors = {
  primary: '#d93025',
  divider: '#e5e7eb',
  background: { paper: '#ffffff' },
  success: { main: '#10b981' },
  text: { primary: '#111827', secondary: '#4b5563' },
};

jest.mock('expo-router', () => ({
  Stack: { Screen: 'Stack.Screen' },
  useRouter: () => ({ push: mockRouterPush }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons',
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'Light' },
  NotificationFeedbackType: { Success: 'Success', Error: 'Error' },
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
}));

jest.mock('@lib/copilot-shim', () => ({
  CopilotStep: 'CopilotStep',
  walkthroughable: (Component: any) => Component,
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ isDark: false, colors: mockColors }),
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ dbUserId: mockDbUserId }),
}));

jest.mock('@contexts/EventContext', () => ({
  useEvent: () => ({ event: { id: 'event-2026' } }),
}));

jest.mock('@contexts/ToastContext', () => ({
  useToastHelpers: () => ({
    showSuccess: jest.fn(),
    showError: mockShowError,
  }),
}));

jest.mock('@contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: [],
    refreshNotifications: mockRefreshNotifications,
  }),
}));

jest.mock('@contexts/BalanceContext', () => ({
  useBalance: () => ({ refreshBalance: jest.fn() }),
}));

jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../../components/SpeakerAvatar', () => 'SpeakerAvatar');
jest.mock('../../components/LoadingScreen', () => 'LoadingScreen');
jest.mock('../../lib/lukas-reward-service', () => ({ lukasRewardService: {} }));

jest.mock('../../components/UnifiedSearchAndFilter', () => 'UnifiedSearchAndFilter');

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    request: (...args: unknown[]) => mockApiRequest(...args),
  },
  eventApiPath: (eventId: string, resource: string) => `events/${eventId}/${resource}`,
}));

import MyRequestsView from '../../app/events/[eventSlug]/networking/my-requests';

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const sentRequest = {
  id: 'sent-1',
  _direction: 'sent',
  status: 'accepted',
  speaker_name: 'Sofía Speaker',
  requester_name: 'Current User',
  requester_company: 'HashPass',
  created_at: '2026-07-29T10:00:00.000Z',
  updated_at: '2026-07-29T10:00:00.000Z',
  duration_minutes: 15,
  meeting_type: 'networking',
};

const incomingRequest = {
  id: 'incoming-1',
  _direction: 'incoming',
  status: 'pending',
  speaker_name: 'Sofía Speaker',
  requester_name: 'Mariana Requester',
  requester_company: 'Partner Co',
  created_at: '2026-07-29T11:00:00.000Z',
  updated_at: '2026-07-29T11:00:00.000Z',
  duration_minutes: 30,
  meeting_type: 'networking',
};

const renderScreen = async () => {
  let renderer: TestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(<MyRequestsView />);
    await flushPromises();
  });

  return renderer!;
};

const pressText = async (renderer: TestRenderer.ReactTestRenderer, label: string) => {
  let target: any = renderer.root.findAll(
    (node: any) => node.type === 'Text' && node.props.children === label,
  )[0];

  while (target && typeof target.props?.onPress !== 'function') {
    target = target.parent;
  }

  expect(target).toBeDefined();

  await act(async () => {
    target.props.onPress();
    await flushPromises();
  });
};

const pressTextAt = async (renderer: TestRenderer.ReactTestRenderer, label: string, index: number) => {
  let target: any = renderer.root.findAll(
    (node: any) => node.type === 'Text' && node.props.children === label,
  )[index];

  while (target && typeof target.props?.onPress !== 'function') {
    target = target.parent;
  }

  expect(target).toBeDefined();

  await act(async () => {
    target.props.onPress();
    await flushPromises();
  });
};

const applyCurrentFilter = async (renderer: TestRenderer.ReactTestRenderer) => {
  const filter = renderer.root.findByType('UnifiedSearchAndFilter' as any);

  await act(async () => {
    filter.props.onFilteredData(filter.props.data);
    await flushPromises();
  });
};

describe('MyRequestsView', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    mockDbUserId = 'user-123';
    mockParams = {};
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [] } });

    // The shared Jest React Native mock intentionally keeps its surface small.
    // This screen uses RefreshControl, so expose it for host-tree assertions.
    require('react-native').RefreshControl = 'RefreshControl';
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('loads event-scoped requests and renders the sent and incoming request states', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { data: [sentRequest, incomingRequest] },
    });

    const renderer = await renderScreen();
    await applyCurrentFilter(renderer);

    expect(mockApiRequest).toHaveBeenCalledWith('events/event-2026/meetings/requests', {
      skipEventSegment: true,
    });
    expect(renderer.root.findAllByProps({ children: 'Sofía Speaker' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ children: 'ACCEPTED' }).length).toBeGreaterThan(0);

    await pressText(renderer, 'requestView.tabs.incoming');
    await applyCurrentFilter(renderer);

    expect(renderer.root.findAllByProps({ children: 'Mariana Requester' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ children: 'PENDING' }).length).toBeGreaterThan(0);
    expect(renderer.root.findByType('SpeakerAvatar' as any).props.imageUrl).toContain('seed=mariana-requester');

    await act(async () => renderer.unmount());
  });

  it('uses the route event and opens the requested detail drawer from a deep link', async () => {
    mockParams = { eventSlug: 'chile2026', requestId: 'sent-1' };
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [sentRequest] } });

    const renderer = await renderScreen();

    expect(mockApiRequest).toHaveBeenCalledWith('events/chile2026/meetings/requests', {
      skipEventSegment: true,
    });
    expect(
      renderer.root.findAllByType('Modal' as any).some((modal: any) => modal.props.visible),
    ).toBe(true);

    await act(async () => renderer.unmount());
  });

  it('shows the speaker’s actual role and company in request details', async () => {
    mockParams = { eventSlug: 'chile2026', requestId: 'sent-1' };
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        data: [{
          ...sentRequest,
          speaker_title: 'Founder & CEO',
          speaker_company: 'Hashpass',
        }],
      },
    });

    const renderer = await renderScreen();
    try {
      expect(renderer.root.findByProps({ children: 'Founder & CEO' })).toBeTruthy();
      expect(renderer.root.findByProps({ children: 'Hashpass' })).toBeTruthy();
    } finally {
      await act(async () => renderer.unmount());
    }
  });

  it('shows the actual expiry with a days unit when a request expires days from now', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:13:18.000Z'));
    mockParams = { eventSlug: 'chile2026', requestId: 'sent-1' };
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        data: [{
          ...sentRequest,
          expires_at: '2026-08-03T20:03:00.000Z',
        }],
      },
    });

    const renderer = await renderScreen();

    expect(renderer.root.findAllByProps({ children: '02' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ children: 'requestView.days' }).length).toBeGreaterThan(0);

    await act(async () => renderer.unmount());
  });

  it('shows a zeroed countdown when the persisted request expiry has passed', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-04T10:13:18.000Z'));
    mockParams = { eventSlug: 'chile2026', requestId: 'sent-1' };
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { data: [{ ...sentRequest, expires_at: '2026-08-03T20:03:00.000Z' }] },
    });

    const renderer = await renderScreen();

    expect(renderer.root.findAllByProps({ children: '00' }).length).toBeGreaterThanOrEqual(4);
    expect(renderer.root.findByProps({ children: 'requestView.days' })).toBeTruthy();

    await act(async () => renderer.unmount());
  });

  it('does not show a countdown for an invalid persisted expiry date', async () => {
    mockParams = { eventSlug: 'chile2026', requestId: 'sent-1' };
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { data: [{ ...sentRequest, expires_at: 'not-a-date' }] },
    });

    const renderer = await renderScreen();

    expect(renderer.root.findAllByProps({ children: 'requestView.expiresIn' })).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('leaves the loading state and reports an error when the request load fails', async () => {
    mockApiRequest.mockResolvedValue({ success: false, error: 'Service unavailable' });

    const renderer = await renderScreen();

    expect(mockShowError).toHaveBeenCalledWith(
      'requestView.loadErrorTitle',
      'requestView.loadErrorMessage',
    );
    expect(renderer.root.findAllByType('LoadingScreen' as any)).toHaveLength(0);
    expect(renderer.root.findAllByProps({ children: 'requestView.emptyState.noSentTitle' }).length).toBeGreaterThan(0);

    await act(async () => renderer.unmount());
  });

  it('does not keep the screen loading or call the API before an authenticated user is available', async () => {
    mockDbUserId = null;

    const renderer = await renderScreen();

    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType('LoadingScreen' as any)).toHaveLength(0);
    expect(renderer.root.findAllByProps({ children: 'requestView.emptyState.noSentTitle' }).length).toBeGreaterThan(0);

    await act(async () => renderer.unmount());
  });

  it('opens the decline reason modal and sends the typed reason with the decline action', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [incomingRequest] } });

    const renderer = await renderScreen();
    await pressText(renderer, 'requestView.tabs.incoming');
    await applyCurrentFilter(renderer);

    await pressText(renderer, 'Mariana Requester');

    mockApiRequest.mockResolvedValue({ success: true, data: { data: { success: true } } });

    // First match is the detail modal's own Decline button, which opens the
    // reason modal instead of declining immediately.
    await pressTextAt(renderer, 'requestView.decline', 0);

    const input = renderer.root.findByType('TextInput' as any);
    await act(async () => {
      input.props.onChangeText('Schedule conflict this week');
      await flushPromises();
    });

    // Second match is the reason modal's own confirm button.
    await pressTextAt(renderer, 'requestView.decline', 1);

    const declineCall = mockApiRequest.mock.calls.find(
      ([, options]: [string, any]) => options?.body?.action === 'decline',
    );
    expect(declineCall).toBeDefined();
    expect(declineCall![1].body).toEqual({
      requestId: 'incoming-1',
      action: 'decline',
      response: 'Schedule conflict this week',
    });

    await act(async () => renderer.unmount());
  });

  it('shows the speaker response note on the card for accepted and declined requests', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        data: [
          { ...sentRequest, id: 'sent-accepted', status: 'accepted', speaker_response: 'Looking forward to it, see you then!' },
          { ...sentRequest, id: 'sent-declined', status: 'declined', speaker_response: 'Fully booked that week, sorry.' },
          { ...sentRequest, id: 'sent-pending', status: 'pending', speaker_response: '' },
        ],
      },
    });

    const renderer = await renderScreen();
    await applyCurrentFilter(renderer);

    expect(renderer.root.findAllByProps({ children: 'Looking forward to it, see you then!' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ children: 'Fully booked that week, sorry.' }).length).toBeGreaterThan(0);

    await act(async () => renderer.unmount());
  });

  it('sends an optional note when accepting a request with a selected slot', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { data: [{ ...incomingRequest, speaker_id: 'speaker-user-id' }] },
    });

    const renderer = await renderScreen();
    await pressText(renderer, 'requestView.tabs.incoming');
    await applyCurrentFilter(renderer);

    await pressText(renderer, 'Mariana Requester');

    mockApiRequest.mockResolvedValue({
      success: true,
      data: { data: [{ slot_time: '2026-08-05T14:00:00.000Z', duration_minutes: 15 }] },
    });

    await pressText(renderer, 'requestView.accept');

    // Locate the rendered slot item via its unique icon rather than its
    // (locale/timezone-dependent) formatted time text.
    const slotIcon = renderer.root.findByProps({ name: 'access-time' });
    let slotTouchable: any = slotIcon;
    while (slotTouchable && typeof slotTouchable.props?.onPress !== 'function') {
      slotTouchable = slotTouchable.parent;
    }
    expect(slotTouchable).toBeDefined();
    await act(async () => {
      slotTouchable.props.onPress();
      await flushPromises();
    });

    const noteInput = renderer.root.findByProps({ placeholder: 'requestView.slotPicker.notePlaceholder' });
    await act(async () => {
      noteInput.props.onChangeText('Excited to connect, bring your deck!');
      await flushPromises();
    });

    mockApiRequest.mockResolvedValue({
      success: true,
      data: { data: { success: true, status: 'confirmed', meeting_id: 'meeting-1' } },
    });

    await pressText(renderer, 'requestView.slotPicker.confirmSelection');

    const acceptCall = mockApiRequest.mock.calls.find(
      ([, options]: [string, any]) => options?.body?.action === 'accept',
    );
    expect(acceptCall).toBeDefined();
    expect(acceptCall![1].body).toEqual({
      requestId: 'incoming-1',
      action: 'accept',
      slotTime: '2026-08-05T14:00:00.000Z',
      response: 'Excited to connect, bring your deck!',
    });

    await act(async () => renderer.unmount());
  });

  it('does not decline when the reason modal is dismissed via Go Back', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [incomingRequest] } });

    const renderer = await renderScreen();
    await pressText(renderer, 'requestView.tabs.incoming');
    await applyCurrentFilter(renderer);

    await pressText(renderer, 'Mariana Requester');
    await pressTextAt(renderer, 'requestView.decline', 0);
    await pressText(renderer, 'requestView.declineModal.goBack');

    expect(
      mockApiRequest.mock.calls.some(([, options]: [string, any]) => options?.body?.action === 'decline'),
    ).toBe(false);

    await act(async () => renderer.unmount());
  });

});
