/// <reference types="jest" />

import React from 'react';
import { act, create } from 'react-test-renderer';
import SpeakersCalendar from '../../app/events/[eventSlug]/speakers/calendar';
import SpeakerSearchAndSort from '../../components/SpeakerSearchAndSort';

const mockRouterPush = jest.fn();
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

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: mockDbSpeakers, error: null }).then(resolve),
      };
      return query;
    },
  },
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
