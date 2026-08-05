/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

import AgendaScreen from '../../app/events/[eventSlug]/agenda';
import MyScheduleScreen from '../../app/events/[eventSlug]/networking/my-schedule';

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('event schedule screens', () => {
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
    mockRetryDatabaseSession.mockResolvedValue(undefined);
    mockAuthState = { user: null, dbUserId: 'auth-user-uuid', retryDatabaseSession: mockRetryDatabaseSession };
    mockSupabase.from.mockClear();
    mockUserTableMaybeSingle.mockReset();
    mockAgendaStatusMaybeSingle.mockReset();
    mockUserAgendaStatusRows = [];
    mockUserTableMaybeSingle.mockResolvedValue({ data: { id: 'registry-user-id' }, error: null });
    mockAgendaStatusMaybeSingle.mockResolvedValue({ data: null, error: null });

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
    expect(agendaSource).not.toContain('isCompactLayout && styles.actionButtonsCompact');

    await act(async () => {
      renderer!.unmount();
    });
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

    const favoriteText = renderer!.root.findAllByType(Text).find((node) => node.children.join('') === 'actions.favorite');
    expect(favoriteText).toBeTruthy();
    let favoriteButton: any = favoriteText!.parent;
    while (favoriteButton && typeof favoriteButton.props?.onPress !== 'function') favoriteButton = favoriteButton.parent;
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
