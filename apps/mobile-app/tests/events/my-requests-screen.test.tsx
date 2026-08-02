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

    await pressText(renderer, 'Incoming');
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

  it('leaves the loading state and reports an error when the request load fails', async () => {
    mockApiRequest.mockResolvedValue({ success: false, error: 'Service unavailable' });

    const renderer = await renderScreen();

    expect(mockShowError).toHaveBeenCalledWith(
      'Error Loading Requests',
      'Failed to load your meeting requests',
    );
    expect(renderer.root.findAllByType('LoadingScreen' as any)).toHaveLength(0);
    expect(renderer.root.findAllByProps({ children: 'No Sent Requests' }).length).toBeGreaterThan(0);

    await act(async () => renderer.unmount());
  });

  it('does not keep the screen loading or call the API before an authenticated user is available', async () => {
    mockDbUserId = null;

    const renderer = await renderScreen();

    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType('LoadingScreen' as any)).toHaveLength(0);
    expect(renderer.root.findAllByProps({ children: 'No Sent Requests' }).length).toBeGreaterThan(0);

    await act(async () => renderer.unmount());
  });

});
