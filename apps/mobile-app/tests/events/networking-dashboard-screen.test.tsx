/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockApiRequest = jest.fn();
const mockShowError = jest.fn();
const mockRouterPush = jest.fn();
type MockAuthState = {
  user: { id: string; email: string };
  dbUserId: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
};
let mockEvent: { id: string; name?: string } | null = { id: 'chile2026', name: 'BSL Chile 2026' };
let mockAuthState: MockAuthState = {
  user: { id: 'auth-user-1', email: 'attendee@example.com' },
  dbUserId: 'db-user-1',
  isLoggedIn: true,
  isLoading: false,
};
let mockCapturedQuickAccess: {
  items: Array<{ id: string; route?: string }>;
  onItemPress: (item: { id: string; route?: string }) => void;
} | null = null;
const mockChannel = {
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockReturnThis(),
};

jest.mock('expo-router', () => ({
  Stack: { Screen: 'StackScreen' },
  useRouter: () => ({ push: mockRouterPush }),
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ eventSlug: 'chile2026' }),
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: '#1d4ed8',
      background: { default: '#ffffff', paper: '#ffffff' },
      text: { primary: '#111827', secondary: '#4b5563' },
      surface: '#ffffff',
      divider: '#e5e7eb',
    },
  }),
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@contexts/EventContext', () => ({
  useEvent: () => ({ event: mockEvent }),
}));

jest.mock('@contexts/ToastContext', () => ({
  useToastHelpers: () => ({ showSuccess: jest.fn(), showError: mockShowError }),
}));

jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({
    t: ({ message }: { message: string }) => message,
  }),
}));

jest.mock('@lib/copilot-shim', () => ({
  COPILOT_TUTORIALS_ENABLED: false,
  CopilotStep: ({ children }: { children: React.ReactNode }) => children,
  walkthroughable: (Component: React.ComponentType) => Component,
  useCopilot: () => ({
    start: jest.fn(),
    handleNth: jest.fn(),
    copilotEvents: { on: jest.fn(), off: jest.fn() },
  }),
}));

jest.mock('../../hooks/useTutorialPreferences', () => ({
  useTutorialPreferences: () => ({
    shouldShowTutorial: () => false,
    markTutorialCompleted: jest.fn(),
    updateTutorialStep: jest.fn(),
    isReady: true,
    networkingTutorialCompleted: true,
  }),
}));

jest.mock('../../components/explorer/QuickAccessGrid', () => ({
  __esModule: true,
  default: ({ items, onItemPress }: { items: any[]; onItemPress: (item: any) => void }) => {
    mockCapturedQuickAccess = { items, onItemPress };
    return null;
  },
}));
jest.mock('../../components/LoadingScreen', () => 'LoadingScreen');
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));

jest.mock('../../lib/api-client', () => ({
  apiClient: { request: (...args: unknown[]) => mockApiRequest(...args) },
  eventApiPath: (eventId: string, resource: string) => `events/${eventId}/${resource}`,
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
  },
}));

const ReactNative = require('react-native');
const createAnimation = () => ({ start: jest.fn() });
class AnimatedValue {
  interpolate() {
    return 0;
  }
}
ReactNative.Animated.Value = AnimatedValue;
ReactNative.Animated.timing = createAnimation;
ReactNative.Animated.sequence = createAnimation;
ReactNative.Animated.parallel = createAnimation;
ReactNative.Animated.View = ReactNative.View;
ReactNative.RefreshControl = ReactNative.View;

const NetworkingView = require('../../app/events/[eventSlug]/networking/index').default;

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('networking dashboard', () => {
  beforeEach(() => {
    mockEvent = { id: 'chile2026', name: 'BSL Chile 2026' };
    mockAuthState = {
      user: { id: 'auth-user-1', email: 'attendee@example.com' },
      dbUserId: 'db-user-1',
      isLoggedIn: true,
      isLoading: false,
    };
    mockRouterPush.mockReset();
    mockApiRequest.mockReset();
    mockShowError.mockReset();
    mockCapturedQuickAccess = null;
    mockChannel.on.mockClear();
    mockChannel.subscribe.mockClear();
  });

  it('blocks protected quick access navigation when the user is not fully signed in', async () => {
    mockAuthState = {
      user: { id: 'attendee-1', email: 'attendee@example.com' },
      dbUserId: null,
      isLoggedIn: true,
      isLoading: false,
    };
    mockEvent = { id: 'admin', name: 'Admin Event' };

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<NetworkingView />);
      await flushPromises();
    });

    expect(mockCapturedQuickAccess).not.toBeNull();
    act(() => {
      mockCapturedQuickAccess!.onItemPress({
        id: 'admin-dashboard-shortcut',
        route: '/admin-dashboard',
      });
    });
    expect(mockShowError).toHaveBeenCalledWith('Access Denied', 'Sign in to access this feature.');
    expect(mockRouterPush).not.toHaveBeenCalled();

    await act(async () => renderer!.unmount());
  });

  it('blocks speaker dashboard quick access when dbUserId is absent', async () => {
    mockAuthState = {
      user: { id: 'attendee-2', email: 'attendee2@example.com' },
      dbUserId: null,
      isLoggedIn: true,
      isLoading: false,
    };

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<NetworkingView />);
      await flushPromises();
    });

    expect(mockCapturedQuickAccess).not.toBeNull();
    act(() => {
      mockCapturedQuickAccess!.onItemPress({
        id: 'speaker-dashboard-shortcut',
        route: '/events/chile2026/speaker-dashboard',
      });
    });
    expect(mockShowError).toHaveBeenCalledWith('Access Denied', 'Sign in to access this feature.');
    expect(mockRouterPush).not.toHaveBeenCalled();

    await act(async () => renderer!.unmount());
  });

  it('allows navigation for non-protected quick access routes', async () => {
    mockAuthState = {
      user: { id: 'attendee-3', email: 'attendee3@example.com' },
      dbUserId: 'db-user-3',
      isLoggedIn: true,
      isLoading: false,
    };
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        data: {
          counts: {
            total_requests: 8,
            pending_requests: 1,
            accepted_requests: 1,
            declined_requests: 0,
            cancelled_requests: 0,
          },
          speaker: { blockedUsers: 2 },
        },
      },
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<NetworkingView />);
      await flushPromises();
    });

    expect(mockCapturedQuickAccess).not.toBeNull();
    act(() => {
      mockCapturedQuickAccess!.onItemPress({
        id: 'find-speakers-shortcut',
        route: '/events/chile2026/speakers',
      });
    });
    expect(mockShowError).not.toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith('/events/chile2026/speakers');

    await act(async () => renderer!.unmount());
  });

  it('loads and renders authenticated stats from the event-scoped backend API', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        data: {
          counts: {
            total_requests: 12,
            pending_requests: 3,
            accepted_requests: 4,
            declined_requests: 2,
            cancelled_requests: 1,
          },
          speaker: { blockedUsers: 5 },
        },
      },
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<NetworkingView />);
      await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenCalledWith('events/chile2026/networking/stats', {
      skipEventSegment: true,
    });
    const renderedText = renderer!.root
      .findAll((node: any) => node.type === 'Text')
      .flatMap((node) => node.children)
      .join(' ');
    const normalizedText = renderedText.replace(/\s+/g, ' ').trim();
    expect(normalizedText).toContain('Your Networking Stats');
    expect(normalizedText).toContain('Networking for BSL Chile 2026');
    expect(normalizedText).toContain('Connect with speakers and attendees');
    expect(normalizedText).toContain('12');
    expect(normalizedText).toContain('5');

    await act(async () => renderer!.unmount());
  });

  it('uses the route event slug while the event context is still loading', async () => {
    mockEvent = null;
    mockApiRequest.mockResolvedValue({ success: true, data: { data: { counts: {}, speaker: {} } } });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<NetworkingView />);
      await flushPromises();
    });

    const renderedText = renderer!.root
      .findAll((node: any) => node.type === 'Text')
      .flatMap((node) => node.children)
      .join(' ');
    expect(renderedText.replace(/\s+/g, ' ').trim()).toContain('Networking for chile2026');
    expect(mockApiRequest).toHaveBeenCalledWith('events/chile2026/networking/stats', {
      skipEventSegment: true,
    });

    await act(async () => renderer!.unmount());
  });
});
