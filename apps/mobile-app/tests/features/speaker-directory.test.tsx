/// <reference types="jest" />

import React from 'react';
import { act, create } from 'react-test-renderer';

const mockRouterPush = jest.fn();
const mockDbSpeakers = [
  { id: 'inactive-speaker', name: 'Inactive Speaker', title: 'Advisor', company: 'Hashpass', user_id: null, is_active: true },
  { id: 'active-speaker', name: 'Active Speaker', title: 'Founder', company: 'Hashpass', user_id: 'claimed-auth-user', is_active: true },
];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@contexts/EventContext', () => ({
  useEvent: () => ({
    event: {
      id: 'chile2026',
      eventDateString: 'BSL Chile 2026',
      eventStartDate: '2026-08-05T09:00:00-04:00',
      eventEndDate: '2026-08-07T23:59:59-04:00',
      speakers: [],
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
    from: () => ({
      select: () => Promise.resolve({ data: mockDbSpeakers, error: null }),
    }),
  },
}));

jest.mock('../../components/EventBanner', () => 'EventBanner');
jest.mock('../../components/SpeakerAvatar', () => 'SpeakerAvatar');
jest.mock('../../components/LoadingScreen', () => 'LoadingScreen');
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('../../lib/string-utils', () => ({
  getSpeakerAvatarUrl: (name: string) => `avatar:${name}`,
  resolveConfiguredSpeakerImage: (image: string | undefined, name: string) => image || `avatar:${name}`,
  resolveSpeakerImage: (image: string | undefined, name: string) => image || `avatar:${name}`,
}));

import SpeakersCalendar from '../../app/events/[eventSlug]/speakers/calendar';

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('speaker directory', () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
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
    expect(renderer!.root.findByProps({ children: 'Inactive' })).toBeTruthy();

    await act(async () => renderer!.unmount());
  });
});
