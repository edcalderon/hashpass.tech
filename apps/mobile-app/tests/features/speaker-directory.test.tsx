/// <reference types="jest" />

import React from 'react';
import { act, create } from 'react-test-renderer';
import SpeakersCalendar from '../../app/events/[eventSlug]/speakers/calendar';
import SpeakerSearchAndSort from '../../components/SpeakerSearchAndSort';

const mockRouterPush = jest.fn();
const mockApiRequest = jest.fn();
type DbSpeaker = {
  id: string;
  name: string;
  title: string;
  company: string;
  user_id: string | null;
  is_active: boolean;
  sort_order?: number;
  metadata?: { is_active: boolean };
};

type EventSpeaker = {
  id: string;
  name: string;
  title?: string;
  company?: string;
  image?: string;
};

const defaultDbSpeakers = (): DbSpeaker[] => [
  { id: 'inactive-speaker', name: 'Inactive Speaker', title: 'Advisor', company: 'Hashpass', user_id: null, is_active: true },
  { id: 'active-speaker', name: 'Active Speaker', title: 'Founder', company: 'Hashpass', user_id: 'claimed-auth-user', is_active: true },
];
let mockDbSpeakers: DbSpeaker[] = defaultDbSpeakers();
let mockEventSpeakers: EventSpeaker[] = [];
let mockEventId = 'chile2026';
const mockConfiguredImage = jest.fn((image: string | undefined, name: string) => image || `avatar:${name}`);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@contexts/EventContext', () => ({
  useEvent: () => ({
    event: {
      id: mockEventId,
      eventDateString: 'BSL Chile 2026',
      eventStartDate: '2026-08-05T09:00:00-04:00',
      eventEndDate: '2026-08-07T23:59:59-04:00',
      speakers: mockEventSpeakers,
    },
  }),
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: { default: '#fafafa', paper: '#ffffff' },
      divider: '#e5e7eb',
      text: { primary: '#111827', secondary: '#6b7280' },
    },
  }),
}));

// calendar.tsx loads the directory through the server-gated
// /api/events/{eventId}/speakers endpoint (speakers_public, db/migrations/V109)
// rather than querying Supabase directly, so this mocks that client boundary
// instead of the DB client. The legacy bsl->bsl2025 event-id mapping is a
// server concern now (see tests/api/event-speaker-detail.test.ts), not
// something this component test observes.
jest.mock('../../lib/api-client', () => ({
  apiClient: { request: (...args: unknown[]) => mockApiRequest(...args) },
  eventApiPath: (eventId: string, resource: string) => `events/${eventId}/${resource}`,
}));

jest.mock('../../components/EventBanner', () => 'EventBanner');
jest.mock('../../components/SpeakerAvatar', () => 'SpeakerAvatar');
jest.mock('../../components/LoadingScreen', () => 'LoadingScreen');
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('../../lib/string-utils', () => ({
  getSpeakerAvatarUrl: (name: string) => `avatar:${name}`,
  resolveConfiguredSpeakerImage: (image: string | undefined, name: string) => mockConfiguredImage(image, name),
  resolveSpeakerImage: (image: string | undefined, name: string) => image || `avatar:${name}`,
}));

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('speaker directory', () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
    mockDbSpeakers = defaultDbSpeakers();
    mockEventSpeakers = [];
    mockEventId = 'chile2026';
    mockConfiguredImage.mockReset().mockImplementation((image, name) => image || `avatar:${name}`);
    mockApiRequest.mockReset().mockImplementation(() =>
      Promise.resolve({ success: true, data: { data: mockDbSpeakers } }),
    );
  });

  it('preserves CBWeek database priorities in the rendered directory', async () => {
    mockEventId = 'cbweek2026';
    mockDbSpeakers = ['Edward', 'Bryan', 'Lucero'].map((name, index) => ({
      id: name, name, title: 'Speaker', company: 'Event', user_id: null,
      is_active: true, metadata: { is_active: true }, sort_order: 30 - index * 10,
    }));
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<SpeakersCalendar />); await flushPromises(); });
    const cards = renderer!.root.findAll((node) => node.props?.accessibilityState?.disabled !== undefined);
    cards.forEach((card) => act(() => card.props.onPress()));
    expect(mockRouterPush.mock.calls.map(([route]) => route.split('/').pop())).toEqual(['Lucero', 'Bryan', 'Edward']);
    act(() => renderer!.unmount());
  });

  it.each([
    ['cbweek2026', false], ['cbweek2026', true], ['chile2026', true],
  ])('retains configured speakers for %s, emergency=%s', async (eventId, emergency) => {
    mockEventId = eventId as string;
    mockDbSpeakers = [];
    mockEventSpeakers = [{ id: 'lucero', name: 'Lucero', title: 'COO', company: 'Event' }];
    if (emergency) mockConfiguredImage.mockImplementationOnce(() => { throw new Error('Image lookup unavailable'); });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    let renderer: ReturnType<typeof create>;
    try {
      await act(async () => { renderer = create(<SpeakersCalendar />); await flushPromises(); });
      const search = renderer!.root.findByType(SpeakerSearchAndSort);
      expect(search.props.speakers[0].sortOrder).toBe(eventId === 'cbweek2026' ? 0 : undefined);
      expect(renderer!.root.findByProps({ children: 'Lucero' })).toBeTruthy();
    } finally {
      act(() => renderer!.unmount());
      consoleError.mockRestore();
    }
  });

  // The legacy bsl->bsl2025 event-id remapping now happens server-side only
  // (see tests/api/event-speaker-detail.test.ts) -- calendar.tsx just passes
  // the route's literal event id through to the gated API.
  it.each(['bsl', 'colombia2026'])('requests the event-scoped speaker directory for %s', async (eventId) => {
    mockEventId = eventId;
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(<SpeakersCalendar />);
      await flushPromises();
    });

    expect(mockApiRequest).toHaveBeenCalledWith(`events/${eventId}/speakers`, expect.anything());
    act(() => renderer!.unmount());
  });

  it('shows all speakers while disabling the unclaimed profiles', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SpeakersCalendar />);
      await flushPromises();
    });

    const cards = renderer!.root.findAll((node: any) => node.props?.accessibilityState?.disabled !== undefined);
    const activeCard = cards.find((node: any) => node.props.accessibilityState.disabled === false);
    const inactiveCard = cards.find((node: any) => node.props.accessibilityState.disabled === true);

    if (!activeCard || !inactiveCard) {
      throw new Error('Expected both an active and inactive speaker card');
    }

    expect(activeCard.props.disabled).toBe(false);
    expect(typeof activeCard.props.onPress).toBe('function');
    expect(inactiveCard.props.disabled).toBe(true);
    expect(inactiveCard.props.onPress).toBeUndefined();
    expect(cards.map((card: any) => card.props.accessibilityState.disabled)).toEqual([false, true]);
    expect(renderer!.root.findByProps({ children: 'Inactive' })).toBeTruthy();

    act(() => activeCard.props.onPress());
    expect(mockRouterPush).toHaveBeenCalledWith('/events/chile2026/speakers/active-speaker');

    await act(async () => renderer!.unmount());
  });

  it('shows the directory-not-public state instead of falling back to configured speakers when speakers_public=false (db/migrations/V109)', async () => {
    mockEventSpeakers = [{ id: 'configured-speaker', name: 'Configured Speaker', title: 'Moderator', company: 'Hashpass' }];
    mockApiRequest.mockReset().mockResolvedValue({ success: true, data: { public: false } });

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SpeakersCalendar />);
      await flushPromises();
    });

    expect(renderer!.root.findByProps({ children: 'Speaker directory not public yet' })).toBeTruthy();
    // Never falls back to the event's bundled speaker config just because
    // the real directory came back empty -- that would defeat the gate.
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('Configured Speaker');
    expect(mockRouterPush).not.toHaveBeenCalled();

    await act(async () => renderer!.unmount());
  });

  it('uses non-interactive fallback speakers when the database returns no records', async () => {
    mockDbSpeakers = [];
    mockEventSpeakers = [{
      id: 'configured-speaker',
      name: 'Configured Speaker',
      title: 'Moderator',
      company: 'Hashpass',
      image: '/speaker.png',
    }];

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SpeakersCalendar />);
      await flushPromises();
    });

    const cards = renderer!.root.findAll((node: any) => node.props?.accessibilityState?.disabled !== undefined);
    expect(cards).toHaveLength(1);
    expect(cards[0].props.disabled).toBe(true);
    expect(renderer!.root.findByProps({ children: 'Configured Speaker' })).toBeTruthy();
    expect(renderer!.root.findByProps({ children: 'Inactive' })).toBeTruthy();

    await act(async () => renderer!.unmount());
  });
});
