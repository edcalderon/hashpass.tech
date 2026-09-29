/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { uiTokens } from '@hashpass/ui/tokens';

const myScheduleSource = readFileSync(
  resolve(__dirname, '../../app/events/[eventSlug]/networking/my-schedule.tsx'),
  'utf8',
);
const agendaSource = readFileSync(
  resolve(__dirname, '../../app/events/[eventSlug]/agenda.tsx'),
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
const mockRetryDatabaseSession = jest.fn();
const mockFileSystemWriteAsStringAsync = jest.fn();
const mockSharingIsAvailableAsync = jest.fn();
const mockSharingShareAsync = jest.fn();
const mockT = (key: string) => key;

const mockEvent: any = {
  id: 'custom',
  api: {
    basePath: '/api/bsl',
  },
  agenda: [] as any[],
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
let mockActiveEvent = mockEvent;
let mockAuthState: any = { user: null, dbUserId: 'auth-user-uuid', retryDatabaseSession: mockRetryDatabaseSession };

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

const mockUserTableMaybeSingle = jest.fn();
const mockAgendaStatusMaybeSingle = jest.fn();
let mockUserAgendaStatusRows: any[] = [];

const createQueryBuilder = (table: string) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  filter: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
  // 'user' is the registry lookup (resolveRegistryUserId); everything else
  // (user_agenda_status) is the toggle handlers' existing-row check.
  maybeSingle: table === 'user' ? mockUserTableMaybeSingle : mockAgendaStatusMaybeSingle,
  insert: jest.fn().mockResolvedValue({ error: null }),
  update: jest.fn().mockReturnThis(),
  then: (onFulfilled: (value: { data: any[]; error: null }) => unknown) =>
    Promise.resolve({
      data: table === 'user_agenda_status' ? mockUserAgendaStatusRows : [],
      error: null,
    }).then(onFulfilled),
});

const mockSupabase = {
  from: jest.fn((table: string) => createQueryBuilder(table)),
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
  NativeSafeIcon: 'NativeSafeIcon',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  useLocalSearchParams: () => mockAgendaParams,
}));

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({
      setOptions: mockNavigationSetOptions,
    }),
    // Real useFocusEffect re-runs its callback on every screen focus; tests
    // here never simulate focus/blur, so running it once like a mount
    // effect is enough to exercise the same data-loading code path.
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => {
        const cleanup = effect();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, []);
    },
  };
});

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'Light',
  },
  impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
}));

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: (...args: unknown[]) => mockFileSystemWriteAsStringAsync(...args),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: (...args: unknown[]) => mockSharingIsAvailableAsync(...args),
  shareAsync: (...args: unknown[]) => mockSharingShareAsync(...args),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('@contexts/EventContext', () => ({
  useEvent: () => ({
    event: mockActiveEvent,
  }),
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: mockThemeColors,
  }),
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
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
  // A plain `supabase: mockSupabase` property is snapshotted the one time
  // this factory runs. Babel hoists this file's `import ... from
  // '../../app/...'` statements above the `const mockSupabase = {...}`
  // declaration below, so that snapshot can capture `mockSupabase` while it
  // is still undefined. A getter re-reads the current value on every
  // access instead, which is what actually exposed the working mock once
  // my-schedule.tsx started calling supabase.from(...) unconditionally.
  get supabase() {
    return mockSupabase;
  },
}));

import AgendaScreen, { agendaTypeRevealTestId } from '../../app/events/[eventSlug]/agenda';
import MyScheduleScreen from '../../app/events/[eventSlug]/networking/my-schedule';
import { getDisplayAgendaDescription } from '../../lib/agenda-description';

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// process.env.NODE_ENV is typed read-only in this repo's TS config, even
// though Jest's Node runtime allows the mutation fine. Object.defineProperty
// sidesteps the type error without an `as any` cast at every call site.
function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

describe('event schedule screens', () => {
  it('keeps ingestion metadata out of user-facing agenda descriptions', () => {
    expect(getDisplayAgendaDescription(
      '{"ends_at":"2026-11-04T10:00:00-05:00","source":"blockchainsummit-colombia2026","source_fingerprint":"abc123"}',
    )).toBeNull();
    expect(getDisplayAgendaDescription('A human-readable programme summary.')).toBe(
      'A human-readable programme summary.',
    );
  });

  const calendarAgendaItem = {
    id: 'calendar-agenda-1',
    day: '1',
    time: '09:00-10:00',
    title: 'Calendar-ready keynote',
    type: 'keynote',
  };

  const renderCalendarAgenda = async () => {
    // Calendar handoffs are native flows; iOS also avoids the web-only
    // location.origin branch absent from this renderer harness.
    mockPlatform = 'ios';
    require('react-native').Platform.OS = mockPlatform;
    mockActiveEvent = {
      ...mockEvent,
      id: 'calendar-event',
      name: 'Calendar Event',
      eventStartDate: '2026-08-05T09:00:00-04:00',
      eventEndDate: '2026-08-05T18:00:00-04:00',
      agenda: [],
    };
    mockApiRequest.mockImplementation((path: string) => Promise.resolve({
      success: true,
      data: { data: path === 'events/calendar-event/agenda' ? [calendarAgendaItem] : [] },
    }));

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AgendaScreen />);
      for (let index = 0; index < 4; index += 1) await flushPromises();
    });
    return renderer!;
  };

  const openCalendarPicker = async (renderer: TestRenderer.ReactTestRenderer) => {
    const openPicker = renderer.root.findByProps({ accessibilityLabel: 'calendar.openPicker' });
    await act(async () => {
      openPicker.props.onPress();
      await flushPromises();
    });
    const modal = renderer.root
      .findAllByType('Modal' as any)
      .find((node) => node.findAllByType(Text).some((text) => text.children.join('') === 'calendar.eyebrow'));
    expect(modal).toBeDefined();
    expect(modal!.props.visible).toBe(true);
    expect(modal!.findAllByType(Text).some((node) => node.children.join('') === calendarAgendaItem.title)).toBe(true);
    return modal!;
  };

  const calendarModal = (renderer: TestRenderer.ReactTestRenderer) => renderer.root
    .findAllByType('Modal' as any)
    .find((node) => node.findAllByType(Text).some((text) => text.children.join('') === 'calendar.eyebrow'))!;

  beforeEach(() => {
    mockWindowWidth = 1024;
    mockPlatform = 'web';
    mockAgendaParams = {};
    mockActiveEvent = mockEvent;
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    mockNavigationSetOptions.mockReset();
    mockApiRequest.mockReset();
    mockImpactAsync.mockReset();
    mockShowSuccess.mockReset();
    mockShowError.mockReset();
    mockShowWarning.mockReset();
    mockRetryDatabaseSession.mockReset();
    mockFileSystemWriteAsStringAsync.mockReset();
    mockSharingIsAvailableAsync.mockReset();
    mockSharingShareAsync.mockReset();
    mockRetryDatabaseSession.mockResolvedValue(undefined);
    mockFileSystemWriteAsStringAsync.mockResolvedValue(undefined);
    mockSharingIsAvailableAsync.mockResolvedValue(true);
    mockSharingShareAsync.mockResolvedValue(undefined);
    mockAuthState = { user: null, dbUserId: 'auth-user-uuid', retryDatabaseSession: mockRetryDatabaseSession };
    mockSupabase.from.mockClear();
    mockUserTableMaybeSingle.mockReset();
    mockAgendaStatusMaybeSingle.mockReset();
    mockUserAgendaStatusRows = [];
    mockUserTableMaybeSingle.mockResolvedValue({ data: { id: 'registry-user-id' }, error: null });
    mockAgendaStatusMaybeSingle.mockResolvedValue({ data: null, error: null });

    const rn = require('react-native');
    rn.Platform.OS = mockPlatform;
    rn.Linking.openURL.mockReset();
    rn.Linking.openURL.mockResolvedValue(undefined);
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

  it('keeps the agenda filter drawer focused on session type because speakers are searchable', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { data: [{ id: 'session-1', day: '1', time: '09:00', title: 'Opening', type: 'keynote' }] },
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AgendaScreen />);
      await flushPromises();
    });

    const agendaFilter = renderer!.root.findByType('UnifiedSearchAndFilter' as any);
    expect(agendaFilter.props.filterGroups).toHaveLength(1);
    expect(agendaFilter.props.filterGroups[0].key).toBe('type');
    expect(agendaFilter.props.filterGroups[0].options).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'keynote', color: '#007AFF' }),
      expect.objectContaining({ key: 'panel', color: '#34A853' }),
      expect.objectContaining({ key: 'workshop', color: '#AF52DE' }),
      expect.objectContaining({ key: 'networking', color: '#00A6C7' }),
      expect.objectContaining({ key: 'registration', color: '#8E8E93' }),
    ]));
    const typeLegend = renderer!.root.findByProps({ testID: 'agenda-type-legend' });
    expect(typeLegend.findAll((node) => String(node.props.testID || '').startsWith('agenda-type-legend-'))).toHaveLength(7);
    const keynoteLegend = typeLegend.findByProps({ testID: 'agenda-type-legend-keynote' });
    expect(keynoteLegend.findByType('NativeSafeIcon' as any).props.name).toBe('mic');
    expect(keynoteLegend.findByType('NativeSafeIcon' as any).props.color).toBe('#007AFF');
    expect(keynoteLegend.props.accessibilityState.expanded).toBe(false);
    await act(async () => {
      keynoteLegend.props.onHoverIn();
    });
    expect(
      renderer!.root.findByProps({ testID: 'agenda-type-legend-keynote' })
        .props.accessibilityState.expanded,
    ).toBe(true);
    await act(async () => {
      renderer!.root.findByProps({ testID: 'agenda-type-legend-keynote' }).props.onHoverOut();
    });
    expect(
      renderer!.root.findByProps({ testID: 'agenda-type-legend-keynote' })
        .props.accessibilityState.expanded,
    ).toBe(false);
    expect(agendaSource).not.toContain('isCompactLayout && styles.actionButtonsCompact');

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('shows programme context on day cards and lets attendees switch agenda presentation', async () => {
    mockApiRequest.mockImplementation((path: string) => Promise.resolve({
      success: true,
      data: {
        data: path === 'events/custom/agenda'
          ? [
            { id: 'day-one-late', day: '1', time: '11:00', title: 'Later panel', type: 'panel' },
            { id: 'day-one-early', day: '1', time: '09:00', title: 'Opening keynote', type: 'keynote' },
            { id: 'day-two', day: '2', time: '10:00', title: 'Workshop', type: 'panel' },
          ]
          : [],
      },
    }));

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AgendaScreen />);
      await flushPromises();
      await flushPromises();
    });

    const dayTabs = renderer!.root.findAll((node) => node.props.accessibilityRole === 'tab');
    expect(dayTabs).toHaveLength(2);
    expect(dayTabs[0].props.accessibilityLabel).toContain('2 tabs.sessions');

    expect(renderer!.root.findByProps({ accessibilityLabel: 'viewMode.compact' }).props.accessibilityState.selected).toBe(true);
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'viewMode.grid' })).toHaveLength(1);

    const titles = renderer!.root.findAllByType(Text).map((node) => node.children.join(''));
    expect(titles.indexOf('Opening keynote')).toBeLessThan(titles.indexOf('Later panel'));

    const listButton = renderer!.root.findByProps({ accessibilityLabel: 'viewMode.list' });
    await act(async () => {
      listButton.props.onPress();
      await flushPromises();
    });
    expect(renderer!.root.findByProps({ accessibilityLabel: 'viewMode.list' }).props.accessibilityState.selected).toBe(true);

    const gridButton = renderer!.root.findByProps({ accessibilityLabel: 'viewMode.grid' });
    await act(async () => {
      gridButton.props.onPress();
      await flushPromises();
    });
    expect(renderer!.root.findByProps({ accessibilityLabel: 'viewMode.grid' }).props.accessibilityState.selected).toBe(true);
    expect(renderer!.root.findByProps({ testID: 'agenda-grid' })).toBeTruthy();

    await act(async () => renderer!.unmount());
  });

  it('uses speaker media, time footer, and the published venue in agenda cards', async () => {
    mockActiveEvent = {
      ...mockEvent,
      id: 'colombia2026',
      tour: {
        city: 'Bogotá',
        country: 'Colombia',
        venue: 'Universidad Externado de Colombia, Bogotá',
      },
      speakers: [{ id: 'speaker-a', name: 'Ada Lovelace', image: 'https://images.example.test/ada.jpg' }],
    };
    mockApiRequest.mockImplementation((path: string) => Promise.resolve({
      success: true,
      data: {
        data: path === 'events/colombia2026/agenda'
          ? [
            {
              id: 'keynote-session',
              day: '1',
              time: '08:00 - 09:00',
              title: 'Opening keynote',
              description: 'A human-readable programme summary.',
              type: 'keynote',
              speakers: ['speaker-a'],
              location: 'Auditorio Principal',
            },
            {
              id: 'networking-session',
              day: '1',
              time: '09:30',
              title: 'Community connections',
              description: '{"ends_at":"2026-11-04T10:00:00-05:00","source":"blockchainsummit-colombia2026","source_fingerprint":"abc123"}',
              type: 'networking',
              speakers: ['speaker-a'],
              location: 'Hall principal',
            },
            {
              id: 'panel-session',
              day: '1',
              time: '09:45',
              title: 'Financial infrastructure panel',
              type: 'panel',
              location: 'Panel central',
            },
            {
              id: 'workshop-session',
              day: '1',
              time: '10:00',
              title: 'Builder workshop',
              type: 'workshop',
              location: 'Sala Taller',
            },
          ]
          : [{ id: 'speaker-a', name: 'Ada Lovelace', image_url: null }],
      },
    }));

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AgendaScreen />);
      await flushPromises();
      await flushPromises();
    });

    const media = renderer!.root.findByProps({ testID: 'agenda-card-media-keynote-session' });
    expect(media.findAllByType('Image' as any).some((node) => (
      node.props.source?.uri === 'https://images.example.test/ada.jpg'
    ))).toBe(true);
    expect(media.findByProps({ accessibilityLabel: 'Ada Lovelace avatar' })).toBeTruthy();
    expect(media.findByProps({ testID: 'agenda-card-venue-keynote-session' })).toBeTruthy();
    const timeFooterStyles = renderer!.root
      .findByProps({ testID: 'agenda-card-time-footer-keynote-session' })
      .props.style;
    expect(timeFooterStyles).toEqual(expect.objectContaining({
      backgroundColor: 'rgba(3, 12, 24, 0.42)',
      borderTopWidth: 1,
    }));
    expect(renderer!.root.findByProps({ testID: 'agenda-card-time-keynote-session' }).children.join('')).toBe('8:00 – 9:00 AM');
    expect(renderer!.root.findAll((node) => (
      node.type === Text && node.children.join('').includes('source_fingerprint')
    ))).toHaveLength(0);
    expect(renderer!.root.findByProps({ children: 'Auditorio Principal' })).toBeTruthy();
    const networkingMedia = renderer!.root.findByProps({ testID: 'agenda-card-media-networking-session' });
    expect(networkingMedia.findAllByType('NativeSafeIcon' as any).some((node) => node.props.name === 'people')).toBe(false);
    const networkingWatermark = renderer!.root.findByProps({ testID: 'agenda-card-type-watermark-networking-session' });
    const networkingShell = renderer!.root.findByProps({ testID: 'agenda-card-type-shell-networking-session' });
    const networkingCollapsedIcon = renderer!.root
      .findByProps({ testID: 'agenda-card-type-collapsed-icon-networking-session' });
    expect(networkingWatermark.props.accessibilityState.expanded).toBe(false);
    expect(networkingCollapsedIcon.findByType('NativeSafeIcon' as any).props.name).toBe('people');
    expect(networkingCollapsedIcon.findByType('NativeSafeIcon' as any).props.color).toBe('#00A6C752');
    expect(networkingShell.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ backgroundColor: '#00A6C71A' }),
    ]));
    expect(networkingWatermark.findByProps({ testID: 'agenda-card-type-layer-networking-session' })).toBeTruthy();
    expect(networkingWatermark.findByProps({ children: 'TYPES.NETWORKING' })).toBeTruthy();
    await act(async () => {
      networkingWatermark.props.onHoverIn();
    });
    expect(
      renderer!.root.findByProps({ testID: 'agenda-card-type-watermark-networking-session' })
        .props.accessibilityState.expanded,
    ).toBe(true);
    await act(async () => {
      renderer!.root.findByProps({ testID: 'agenda-card-type-watermark-networking-session' }).props.onHoverOut();
    });
    expect(
      renderer!.root.findByProps({ testID: 'agenda-card-type-watermark-networking-session' })
        .props.accessibilityState.expanded,
    ).toBe(false);
    jest.useFakeTimers();
    try {
      await act(async () => {
        renderer!.root.findByProps({ testID: 'agenda-card-type-watermark-networking-session' }).props.onPress();
      });
      expect(
        renderer!.root.findByProps({ testID: 'agenda-card-type-watermark-networking-session' })
          .props.accessibilityState.expanded,
      ).toBe(true);
      await act(async () => {
        jest.advanceTimersByTime(3_000);
      });
      expect(
        renderer!.root.findByProps({ testID: 'agenda-card-type-watermark-networking-session' })
          .props.accessibilityState.expanded,
      ).toBe(false);
    } finally {
      jest.useRealTimers();
    }
    expect(networkingMedia.findByProps({ testID: 'agenda-card-venue-networking-session' })).toBeTruthy();
    const panelMedia = renderer!.root.findByProps({ testID: 'agenda-card-media-panel-session' });
    expect(panelMedia.findByProps({ testID: 'agenda-card-venue-panel-session' })).toBeTruthy();
    const workshopMedia = renderer!.root.findByProps({ testID: 'agenda-card-media-workshop-session' });
    expect(workshopMedia.findAllByType('NativeSafeIcon' as any).some((node) => node.props.name === 'build')).toBe(false);
    expect(
      renderer!.root
        .findByProps({ testID: 'agenda-card-type-collapsed-icon-workshop-session' })
        .findByType('NativeSafeIcon' as any).props.name,
    ).toBe('build');
    expect(workshopMedia.findAllByProps({ testID: 'agenda-card-venue-workshop-session' })).toHaveLength(0);

    const gridButton = renderer!.root.findByProps({ accessibilityLabel: 'viewMode.grid' });
    await act(async () => {
      gridButton.props.onPress();
      await flushPromises();
    });
    expect(renderer!.root.findByProps({ accessibilityLabel: 'viewMode.grid' }).props.accessibilityState.selected).toBe(true);
    const gridCards = renderer!.root.findAll((node) => String(node.props.testID || '').startsWith('agenda-card-'));
    expect(gridCards.some((node) => node.props.testID === 'agenda-card-networking-session')).toBe(true);
    expect(gridCards.some((node) => node.props.testID === 'agenda-card-workshop-session')).toBe(true);
    const cardLayoutStyles = renderer!.root
      .findByProps({ testID: 'agenda-card-layout-keynote-session' })
      .props.style.flat(Infinity).filter(Boolean);
    expect(cardLayoutStyles).toEqual(expect.arrayContaining([
      expect.objectContaining({ flexDirection: 'column' }),
    ]));
    const cardMediaStyles = renderer!.root
      .findByProps({ testID: 'agenda-card-media-keynote-session' })
      .props.style.flat(Infinity).filter(Boolean);
    expect(cardMediaStyles).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: '100%' }),
    ]));

    await act(async () => renderer!.unmount());
  });

  it('debounces agenda action hover/focus expansion and clears a pending collapse timeout', async () => {
    const renderer = await renderCalendarAgenda();
    const calendarAction = () => renderer.root.findByProps({ accessibilityLabel: 'calendar.openPicker' });
    const favoriteAction = () => renderer.root.findByProps({ accessibilityLabel: 'actions.addToFavorites' });
    const isExpanded = (label: string) => renderer.root.findAllByProps({ children: label }).length > 0;

    await act(async () => {
      calendarAction().props.onHoverIn();
    });
    expect(isExpanded('calendar.openPicker')).toBe(true);

    jest.useFakeTimers();
    try {
      // Letting the debounce timer run to completion collapses the action
      // (covers the scheduled collapse callback itself, not just the
      // scheduling call).
      await act(async () => {
        calendarAction().props.onHoverOut();
      });
      expect(isExpanded('calendar.openPicker')).toBe(true);
      await act(async () => {
        jest.advanceTimersByTime(uiTokens.motion.fast);
      });
      expect(isExpanded('calendar.openPicker')).toBe(false);

      // Re-focusing before the debounce timer fires must clear the pending
      // collapse instead of leaving a stale timeout to run later.
      await act(async () => {
        calendarAction().props.onFocus();
      });
      await act(async () => {
        calendarAction().props.onHoverOut();
      });
      await act(async () => {
        calendarAction().props.onFocus();
      });
      await act(async () => {
        jest.advanceTimersByTime(uiTokens.motion.fast);
      });
      expect(isExpanded('calendar.openPicker')).toBe(true);

      // A different action's collapse timeout firing later must not clobber
      // an unrelated action that is currently expanded.
      await act(async () => {
        favoriteAction().props.onHoverOut();
      });
      await act(async () => {
        jest.advanceTimersByTime(uiTokens.motion.fast);
      });
      expect(isExpanded('calendar.openPicker')).toBe(true);

      await act(async () => {
        calendarAction().props.onBlur();
      });
      expect(isExpanded('calendar.openPicker')).toBe(false);
    } finally {
      jest.useRealTimers();
    }

    await act(async () => renderer.unmount());
  });

  it('omits agenda type-reveal testIDs on production web builds', () => {
    // Rendering the full screen under a mutated NODE_ENV would also flip
    // unrelated dev/prod branching deep in react-native-css-interop's
    // render runtime, so exercise the extracted, pure decision directly
    // instead of round-tripping it through a component tree.
    const rn = require('react-native');
    const originalPlatformOs = rn.Platform.OS;
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      rn.Platform.OS = 'web';

      setNodeEnv('test');
      expect(agendaTypeRevealTestId('agenda-card-type-shell-item')).toEqual({
        testID: 'agenda-card-type-shell-item',
      });

      setNodeEnv('production');
      expect(agendaTypeRevealTestId('agenda-card-type-shell-item')).toEqual({});

      // Native platforms always keep the testID, regardless of NODE_ENV.
      rn.Platform.OS = 'ios';
      expect(agendaTypeRevealTestId('agenda-card-type-shell-item')).toEqual({
        testID: 'agenda-card-type-shell-item',
      });
    } finally {
      rn.Platform.OS = originalPlatformOs;
      setNodeEnv(originalNodeEnv);
    }
  });

  it('keeps a configured speaker portrait when the directory record has no image', async () => {
    mockActiveEvent = {
      ...mockEvent,
      speakers: [{ id: 'speaker-a', name: 'Ada Lovelace', image: 'https://images.example.test/ada.jpg' }],
    };
    mockApiRequest.mockImplementation((path: string) => Promise.resolve({
      success: true,
      data: {
        data: path === 'events/custom/agenda'
          ? [{ id: 'speaker-session', day: '1', time: '09:00', title: 'Opening', type: 'keynote', speakers: ['speaker-a'] }]
          : [{ id: 'speaker-a', name: 'Ada Lovelace', image_url: null }],
      },
    }));

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AgendaScreen />);
      await flushPromises();
      await flushPromises();
    });

    const avatarImage = renderer!.root.findAllByType('Image' as any)
      .find((node) => node.props.source?.uri === 'https://images.example.test/ada.jpg');
    expect(avatarImage).toBeDefined();

    await act(async () => renderer!.unmount());
  });

  it('bridges the native database session before favoriting or adding an agenda session', async () => {
    mockAuthState = {
      user: { id: 'better-auth-user', email: 'attendee@example.test' },
      dbUserId: 'auth-user-uuid',
      retryDatabaseSession: mockRetryDatabaseSession,
    };
    mockApiRequest.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === 'events/custom/agenda/status') {
        return Promise.resolve({ success: true, data: { data: [] } });
      }
      return Promise.resolve({
        success: true,
        data: { data: [{ id: 'session-1', day: '1', time: '09:00', title: 'Opening', type: 'keynote' }] },
      });
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AgendaScreen />);
      await flushPromises();
      await flushPromises();
    });

    const favoriteButton = renderer!.root.findByProps({
      accessibilityLabel: 'actions.addToFavorites',
    });
    await act(async () => {
      await favoriteButton.props.onPress();
      await flushPromises();
    });

    expect(mockRetryDatabaseSession).toHaveBeenCalled();
    expect(mockApiRequest).toHaveBeenCalledWith('events/custom/agenda/status', {
      skipEventSegment: true,
      method: 'POST',
      body: { agendaId: 'session-1', isFavorite: true },
    });
    await act(async () => renderer!.unmount());
  });

  it('retries the agenda request from the empty-agenda state', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [] } });

    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<AgendaScreen />);
      await flushPromises();
    });

    const retryButton = renderer!.root
      .findAllByType(TouchableOpacity)
      .find((node) => node.props.accessibilityLabel === 'empty.retry');

    expect(retryButton).toBeDefined();

    await act(async () => {
      await retryButton!.props.onPress();
      await flushPromises();
    });

    const agendaRequests = mockApiRequest.mock.calls.filter(
      ([path]) => path === 'events/custom/agenda',
    );
    expect(agendaRequests).toHaveLength(2);

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('opens the calendar picker and sends the selected session to Google Calendar', async () => {
    const renderer = await renderCalendarAgenda();
    await openCalendarPicker(renderer);

    const googleCalendar = renderer.root.findByProps({ accessibilityLabel: 'calendar.google' });
    await act(async () => {
      googleCalendar.props.onPress();
      await flushPromises();
    });

    expect(require('react-native').Linking.openURL).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/),
    );
    expect(calendarModal(renderer).props.visible).toBe(false);

    await act(async () => renderer.unmount());
  });

  it('dismisses the top-right calendar picker control', async () => {
    const renderer = await renderCalendarAgenda();
    await openCalendarPicker(renderer);

    const closePicker = renderer.root.findByProps({ accessibilityLabel: 'calendar.close' });
    await act(async () => {
      closePicker.props.onPress();
      await flushPromises();
    });

    expect(calendarModal(renderer).props.visible).toBe(false);

    await act(async () => renderer.unmount());
  });

  it('reports a rejected Google Calendar handoff after dismissing the picker', async () => {
    require('react-native').Linking.openURL.mockRejectedValueOnce(new Error('Google Calendar unavailable'));
    const renderer = await renderCalendarAgenda();
    await openCalendarPicker(renderer);

    const googleCalendar = renderer.root.findByProps({ accessibilityLabel: 'calendar.google' });
    await act(async () => {
      googleCalendar.props.onPress();
      await flushPromises();
    });

    expect(mockShowError).toHaveBeenCalledWith('messages.error', 'calendar.googleError');
    expect(calendarModal(renderer).props.visible).toBe(false);

    await act(async () => renderer.unmount());
  });

  it('exports the selected calendar session through the iOS share sheet', async () => {
    const renderer = await renderCalendarAgenda();
    await openCalendarPicker(renderer);

    const appleCalendar = renderer.root.findByProps({ accessibilityLabel: 'calendar.apple' });
    await act(async () => {
      appleCalendar.props.onPress();
      await flushPromises();
    });

    expect(mockFileSystemWriteAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/hashpass-calendar-event-calendar-agenda-1.ics',
      expect.stringContaining('BEGIN:VCALENDAR'),
    );
    expect(mockSharingShareAsync).toHaveBeenCalledWith(
      'file:///cache/hashpass-calendar-event-calendar-agenda-1.ics',
      {
        mimeType: 'text/calendar',
        UTI: 'com.apple.icalendar',
        dialogTitle: 'calendar.shareTitle',
      },
    );
    expect(calendarModal(renderer).props.visible).toBe(false);

    await act(async () => renderer.unmount());
  });

  it('exports the selected calendar session from the iCalendar download action', async () => {
    const renderer = await renderCalendarAgenda();
    await openCalendarPicker(renderer);

    const downloadCalendar = renderer.root.findByProps({ accessibilityLabel: 'calendar.download' });
    await act(async () => {
      downloadCalendar.props.onPress();
      await flushPromises();
    });

    expect(mockFileSystemWriteAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/hashpass-calendar-event-calendar-agenda-1.ics',
      expect.stringContaining('BEGIN:VCALENDAR'),
    );
    expect(mockSharingShareAsync).toHaveBeenCalledWith(
      'file:///cache/hashpass-calendar-event-calendar-agenda-1.ics',
      expect.objectContaining({
        mimeType: 'text/calendar',
        UTI: 'com.apple.icalendar',
      }),
    );
    expect(calendarModal(renderer).props.visible).toBe(false);

    await act(async () => renderer.unmount());
  });

  it('reports unavailable native calendar sharing after dismissing the picker', async () => {
    mockSharingIsAvailableAsync.mockResolvedValueOnce(false);
    const renderer = await renderCalendarAgenda();
    await openCalendarPicker(renderer);

    const appleCalendar = renderer.root.findByProps({ accessibilityLabel: 'calendar.apple' });
    await act(async () => {
      appleCalendar.props.onPress();
      await flushPromises();
    });

    expect(mockFileSystemWriteAsStringAsync).not.toHaveBeenCalled();
    expect(mockShowError).toHaveBeenCalledWith('messages.error', 'calendar.exportError');
    expect(calendarModal(renderer).props.visible).toBe(false);

    await act(async () => renderer.unmount());
  });

  it('keeps the latest event agenda when an earlier event request resolves late', async () => {
    const chileAgenda = [{
      id: 'chile-session',
      day: '1',
      time: '09:00',
      title: 'Chile opening keynote',
      type: 'keynote',
    }];
    const bslEvent = { ...mockEvent, id: 'bsl', agenda: [] };
    const chileEvent = { ...mockEvent, id: 'chile2026', agenda: chileAgenda };
    let resolveBslAgenda!: (response: { success: boolean; data: { data: unknown[] } }) => void;
    const bslAgendaRequest = new Promise<{ success: boolean; data: { data: unknown[] } }>((resolve) => {
      resolveBslAgenda = resolve;
    });

    mockActiveEvent = bslEvent;
    mockApiRequest.mockImplementation((path: string) => {
      if (path === 'events/bsl/agenda') return bslAgendaRequest;
      return Promise.resolve({ success: true, data: { data: [] } });
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AgendaScreen />);
      await flushPromises();
    });

    mockActiveEvent = chileEvent;
    await act(async () => {
      renderer!.update(<AgendaScreen />);
      await flushPromises();
      await flushPromises();
    });

    await act(async () => {
      resolveBslAgenda({ success: true, data: { data: [] } });
      await flushPromises();
    });

    const agendaFilter = renderer!.root.findByType('UnifiedSearchAndFilter' as any);
    expect(agendaFilter.props.data).toEqual(chileAgenda);

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

  it('mints a share token and opens the live-link share sheet', async () => {
    mockApiRequest
      .mockResolvedValueOnce({ success: true, data: { data: [] } })
      .mockResolvedValueOnce({ success: true, data: { shareToken: 'share-token-1' } });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<MyScheduleScreen />);
      await flushPromises();
    });

    const shareButton = renderer!.root.findByProps({ accessibilityLabel: 'mySchedule.shareMyAgenda' });
    await act(async () => {
      await shareButton.props.onPress();
      await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenLastCalledWith('events/custom/schedule/share-token', {
      method: 'POST',
      skipEventSegment: true,
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain('mySchedule.copyLiveLink');

    await act(async () => renderer!.unmount());
  });

  it('generates a day snapshot from the summary modal', async () => {
    mockActiveEvent = {
      ...mockEvent,
      id: 'chile2026',
      eventStartDate: '2026-08-05T09:00:00-04:00',
      eventEndDate: '2026-08-07T23:59:59-04:00',
    };
    mockUserAgendaStatusRows = [{ agenda_id: 'agenda-1', meeting_id: null, slot_time: null, status: 'confirmed', slot_status: null, is_favorite: false }];
    mockApiRequest.mockImplementation((path: string) =>
      Promise.resolve(path.includes('share-token')
        ? { success: true, data: { shareToken: 'day-token' } }
        : { success: true, data: { data: [{ id: 'agenda-1', day: '1', time: '09:00-09:45', title: 'Opening remarks', type: 'keynote', location: 'Main stage' }] } }),
    );

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<MyScheduleScreen />);
      for (let index = 0; index < 5; index += 1) await flushPromises();
    });

    const dayNumber = renderer!.root.findAllByType(Text).find((node) => node.children.join('') === '5');
    expect(dayNumber).toBeTruthy();
    let dayButton: any = dayNumber!.parent;
    while (dayButton && dayButton.type !== TouchableOpacity) dayButton = dayButton.parent;
    await act(async () => {
      dayButton.props.onPress();
      await flushPromises();
    });

    const snapshotLabel = renderer!.root.findByProps({ children: 'mySchedule.generateSnapshot' });
    let snapshotButton: any = snapshotLabel.parent;
    while (snapshotButton && snapshotButton.type !== TouchableOpacity) snapshotButton = snapshotButton.parent;
    await act(async () => {
      await snapshotButton.props.onPress();
      for (let index = 0; index < 3; index += 1) await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenLastCalledWith('events/chile2026/schedule/share-token', {
      method: 'POST',
      skipEventSegment: true,
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain('mySchedule.copyLiveLink');
    await act(async () => renderer!.unmount());
  });

  it('shows a saved Chile agenda session in its occupied 7 AM slot', async () => {
    mockActiveEvent = {
      ...mockEvent,
      id: 'chile2026',
      eventStartDate: '2026-08-05T09:00:00-04:00',
      eventEndDate: '2026-08-07T23:59:59-04:00',
    };
    mockUserAgendaStatusRows = [{
      agenda_id: 'chile-early-session',
      meeting_id: null,
      slot_time: null,
      status: 'confirmed',
      slot_status: null,
      is_favorite: false,
    }];
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        data: [{
          id: 'chile-early-session',
          day: '1',
          time: '07:30-07:45',
          title: 'Chile early session',
          type: 'keynote',
          location: 'Main stage',
        }],
      },
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<MyScheduleScreen />);
      for (let index = 0; index < 5; index += 1) {
        await flushPromises();
      }
    });

    const hourText = renderer!.root.findByProps({ children: '7 AM' });
    let hourHeader = hourText.parent;
    while (hourHeader && hourHeader.type !== TouchableOpacity) {
      hourHeader = hourHeader.parent;
    }
    expect(
      hourHeader!.findAllByType(Text).some((node) => node.children.join('') === '1/4'),
    ).toBe(true);

    await act(async () => {
      hourHeader!.props.onPress();
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain('Chile early session');

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('drives the free-slot confirmation modal through the registry-scoped toggle handlers', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { data: [] } });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<MyScheduleScreen />);
      await flushPromises();
    });

    // Expand the "8 AM" hour group to render its (meeting-less) free slots.
    const hourText = renderer!.root.findByProps({ children: '8 AM' });
    let hourHeader = hourText.parent;
    while (hourHeader && hourHeader.type !== TouchableOpacity) {
      hourHeader = hourHeader.parent;
    }
    expect(hourHeader).toBeTruthy();
    await act(async () => {
      hourHeader!.props.onPress();
    });

    // Each successful toggle closes the modal (setConfirmationModal({ visible:
    // false, ... })), which unmounts ScheduleConfirmationModal since it's only
    // rendered while a meeting/slotStartTime is set. Re-open it before every
    // interaction rather than reusing one stale instance.
    const openFreeSlotModal = async () => {
      const freeSlotButtons = renderer!.root
        .findAllByType(TouchableOpacity)
        .filter((node) => node.props.onPress && node.props.onPress.name === 'handleFreeSlotPress');
      expect(freeSlotButtons.length).toBeGreaterThan(0);
      await act(async () => {
        freeSlotButtons[0].props.onPress();
      });
      const modal = renderer!.root.findByType('ScheduleConfirmationModal' as any);
      expect(modal.props.isFreeSlot).toBe(true);
      return modal;
    };

    // Free-slot branch, insert path (no existing row).
    let modal = await openFreeSlotModal();
    await act(async () => {
      await modal.props.onConfirm();
      await flushPromises();
    });
    expect(mockSupabase.from).toHaveBeenCalledWith('user_agenda_status');

    // Free-slot branch, update path (existing row found this time).
    mockAgendaStatusMaybeSingle.mockResolvedValueOnce({ data: { id: 'existing-free-slot' }, error: null });
    modal = await openFreeSlotModal();
    await act(async () => {
      await modal.props.onConfirm();
      await flushPromises();
    });

    // Not an agenda event, so this only exercises the early-return guard.
    modal = await openFreeSlotModal();
    await act(async () => {
      await modal.props.onToggleFavorite();
      await flushPromises();
    });

    // handleToggleFreeSlotBlocked, insert path.
    modal = await openFreeSlotModal();
    await act(async () => {
      await modal.props.onToggleBlocked();
      await flushPromises();
    });

    // handleToggleFreeSlotBlocked, update path.
    mockAgendaStatusMaybeSingle.mockResolvedValueOnce({ data: { id: 'existing-blocked-slot' }, error: null });
    modal = await openFreeSlotModal();
    await act(async () => {
      await modal.props.onToggleBlocked();
      await flushPromises();
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
