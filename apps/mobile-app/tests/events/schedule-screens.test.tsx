/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const myScheduleSource = readFileSync(
  resolve(__dirname, '../../app/events/[eventSlug]/networking/my-schedule.tsx'),
  'utf8',
);

let mockWindowWidth = 1024;
let mockPlatform: 'android' | 'ios' | 'web' = 'web';
let mockAgendaParams: Record<string, string | undefined> = {};

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockNavigationSetOptions = jest.fn();
const mockApiRequest = jest.fn();
const mockImpactAsync = jest.fn();
const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
const mockShowWarning = jest.fn();
const mockT = (key: string) => key;

const mockEvent = {
  id: 'custom',
  api: {
    basePath: '/api/bsl',
  },
  agenda: [],
  eventStartDate: null,
  eventEndDate: null,
  eventDateString: 'BSL 2026',
  subtitle: 'Latin America',
  tour: {
    city: 'Bogotá',
    country: 'Colombia',
    venue: 'Corferias',
  },
};

const mockThemeColors = {
  primary: '#d93025',
  primaryContrastText: '#ffffff',
  secondary: '#1f2937',
  secondaryContrastText: '#ffffff',
  surface: '#f5f5f5',
  divider: '#e5e7eb',
  background: {
    default: '#fafafa',
    paper: '#ffffff',
    primary: '#fafafa',
  },
  success: {
    main: '#10b981',
  },
  warning: {
    main: '#f59e0b',
  },
  error: {
    main: '#ef4444',
  },
  text: {
    primary: '#111827',
    secondary: '#4b5563',
  },
};

const createQueryBuilder = () => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
});

const mockSupabase = {
  from: jest.fn(() => createQueryBuilder()),
};

jest.mock('react-native-edge-to-edge', () => ({
  SystemBars: 'SystemBars',
}));

jest.mock('react-native-copilot', () => ({
  CopilotStep: ({ children }: { children: React.ReactNode }) => children,
  walkthroughable: (Component: React.ComponentType<any>) => Component,
}));

jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons',
}));

jest.mock('../../lib/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  useLocalSearchParams: () => mockAgendaParams,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: mockNavigationSetOptions,
  }),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'Light',
  },
  impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
}));

jest.mock('@contexts/EventContext', () => ({
  useEvent: () => ({
    event: mockEvent,
  }),
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: mockThemeColors,
  }),
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
  }),
}));

jest.mock('@contexts/ToastContext', () => ({
  useToastHelpers: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showWarning: mockShowWarning,
  }),
}));

jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({
    t: mockT,
  }),
}));

jest.mock('../../components/EventBanner', () => 'EventBanner');
jest.mock('../../components/UnifiedSearchAndFilter', () => 'UnifiedSearchAndFilter');
jest.mock('../../components/LoadingScreen', () => 'LoadingScreen');
jest.mock('../../components/ScheduleConfirmationModal', () => 'ScheduleConfirmationModal');
jest.mock('../../lib/api-client', () => ({
  apiClient: {
    request: (...args: unknown[]) => mockApiRequest(...args),
  },
  eventApiPath: (eventId: string, resource: string) => `events/${eventId}/${resource}`,
}));
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    request: (...args: unknown[]) => mockApiRequest(...args),
  },
  eventApiPath: (eventId: string, resource: string) => `events/${eventId}/${resource}`,
}));
jest.mock('../../lib/supabase', () => ({
  supabase: mockSupabase,
}));

import AgendaScreen from '../../app/events/[eventSlug]/agenda';
import MyScheduleScreen from '../../app/events/[eventSlug]/networking/my-schedule';

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('event schedule screens', () => {
  beforeEach(() => {
    mockWindowWidth = 1024;
    mockPlatform = 'web';
    mockAgendaParams = {};
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    mockNavigationSetOptions.mockReset();
    mockApiRequest.mockReset();
    mockImpactAsync.mockReset();
    mockShowSuccess.mockReset();
    mockShowError.mockReset();
    mockShowWarning.mockReset();
    mockSupabase.from.mockClear();

    const rn = require('react-native');
    rn.Platform.OS = mockPlatform;
    rn.InteractionManager = {
      runAfterInteractions: jest.fn((callback: () => void) => {
        callback();
        return { cancel: jest.fn() };
      }),
    };
  });

  it('loads agenda data from the shared event API on the agenda screen', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [] } });

    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<AgendaScreen />);
      await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenNthCalledWith(1, 'events/custom/agenda', {
      skipEventSegment: true,
    });
    expect(mockApiRequest).toHaveBeenCalledWith('events/custom/speakers', {
      skipEventSegment: true,
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('loads my schedule agenda data from the shared event API', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [] } });

    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<MyScheduleScreen />);
      await flushPromises();
    });

    expect(mockNavigationSetOptions).toHaveBeenCalledWith({ title: 'mySchedule.title' });
    expect(mockApiRequest).toHaveBeenCalledWith('events/custom/agenda', {
      skipEventSegment: true,
    });

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('event-scopes requester and speaker meeting queries on load and refresh', () => {
    const requesterQueryScopes = myScheduleSource.match(
      /\.eq\('requester_id', dbUserId\)\s*\.eq\('event_id', eventId\)\s*\.order\('created_at'/g,
    ) || [];
    const speakerQueryScopes = myScheduleSource.match(
      /\.in\('speaker_id', speakerIds\)\s*\.eq\('event_id', eventId\)\s*\.order\('created_at'/g,
    ) || [];

    // One query runs during initial load and the other during manual refresh.
    expect(requesterQueryScopes).toHaveLength(2);
    expect(speakerQueryScopes).toHaveLength(2);
  });
});
