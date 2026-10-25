import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Modal, Platform, Pressable, Text, TextInput, TouchableOpacity } from 'react-native';
import { IconButton } from '@hashpass/ui/primitives';
const mockPush = jest.fn(); const mockSetParams = jest.fn(); const mockRetryDatabaseSession = jest.fn(); let mockParams: any = {}; const mockSaveBookmarks = jest.fn(); let mockEvents: any[]; let mockLoggedIn = false; let mockAnimationLevel = 'none'; let mockHeroIndex = 0;
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, setParams: mockSetParams }), useLocalSearchParams: () => mockParams }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: true, colors: { primary: '#22d3ee', divider: '#333', background: { default: '#111', paper: '#19191f' }, text: { primary: '#fff', secondary: '#aaa', disabled: '#777' }, warning: { dark: '#f59e0b' } } }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('../../contexts/AnimationLevelContext', () => ({ useAnimationLevel: () => ({ animationLevel: mockAnimationLevel }) }));
jest.mock('../../contexts/EventContext', () => ({ useEvent: () => ({}) }));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ isLoggedIn: mockLoggedIn, dbUserId: null, retryDatabaseSession: mockRetryDatabaseSession }) }));
jest.mock('../../components/icons/SettingsIcons', () => ({ LogInIcon: () => null }));
jest.mock('../../components/QuickSettingsPanel', () => 'QuickSettingsPanel');
jest.mock('../../app/(shared)/auth', () => 'EmbeddedAuth');
jest.mock('../../lib/vector-icons', () => ({ NativeSafeIcon: () => null }));
jest.mock('../../components/PassesDisplay', () => () => null);
jest.mock('../../components/banner/SliderProgressBar', () => ({ SliderProgressBar: () => null }));
jest.mock('../../lib/hooks/useAutoAdvanceProgress', () => ({ useAutoAdvanceProgress: (options: any) => { options.durationMs?.(0); return { activeIndex: mockHeroIndex, progress: { value: 0 }, pause: jest.fn(), resume: jest.fn(), goTo: jest.fn() }; } }));
jest.mock('../../lib/event-chat', () => ({ loadEventChatPresence: jest.fn(), getEventChatAvatarUrl: jest.fn() }));
jest.mock('../../lib/explorer-bookmarks', () => ({ loadExplorerBookmarks: async () => [], saveExplorerBookmarks: (...args: unknown[]) => mockSaveBookmarks(...args) }));
jest.mock('../../lib/event-detector', () => ({ getAvailableEvents: () => mockEvents, getEventQuickAccessItems: () => [] }));
jest.mock('../../lib/event-branding', () => ({ resolveEventImageSource: (uri: string) => ({ uri }) }));
jest.mock('../../components/EventBannerBackgroundVideo.native', () => 'EventVideo');
jest.mock('../../components/EventBannerBackgroundVideo', () => 'EventVideo', { virtual: true });
jest.mock('../../components/explorer/EventHeroBackground', () => () => null);
import EventsScreen from '../../components/events/GuestExplorer';
import Explorer from '../../components/explorer/Explorer';
let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
// Some cards' inner controls (e.g. Explorer's bookmark/footer buttons) are
// plain Views with onTouchEnd + accessibilityRole="button" rather than
// Pressable/TouchableOpacity -- an intentional web-hydration fix (avoids a
// pressable nested inside the outer card's own pressable). Fall back to
// searching those by accessibilityLabel + onTouchEnd when no typed
// Pressable/TouchableOpacity match is found.
const press = (label: string) => act(() => {
  const typed = [...view.root.findAllByType(Pressable), ...view.root.findAllByType(TouchableOpacity)]
    .find(button => button.props.accessibilityLabel === label);
  if (typed) { typed.props.onPress(); return; }
  const touchTarget = view.root.findAll(
    node => node.props?.accessibilityLabel === label && typeof node.props?.onTouchEnd === 'function',
  )[0];
  touchTarget.props.onTouchEnd({ stopPropagation: () => {} });
});
const setViewport = (width: number, height = 768) => {
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width, height, scale: 1, fontScale: 1 });
};
const setPlatform = (os: string) => Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
beforeEach(() => { setViewport(1024); setPlatform('ios'); mockAnimationLevel = 'none'; mockHeroIndex = 0; mockPush.mockReset(); mockSetParams.mockReset(); mockRetryDatabaseSession.mockReset(); mockParams = {}; mockSaveBookmarks.mockReset(); mockLoggedIn = false; mockEvents = [
  { id: 'main', title: 'Hidden shell', color: '#000' },
  { id: 'one', title: 'Colombia conference', color: '#f00', series: 'Series A', geo: { continent: 'South America', country: 'Colombia' }, routes: { home: '/events//one' }, eventDateString: '2026', eventStartDate: '2099-01-01', image: '/real-event.webp' },
  { id: 'two', title: 'Europe conference', color: '#0f0', series: 'Series B', geo: { continent: 'Europe', country: 'France' }, routes: { home: '/events/two' }, eventStartDate: '2099-02-01' },
]; });
afterEach(() => act(() => view?.unmount()));
it('renders the real Explorer and gates bookmarks and rooms with an in-place form', async () => {
  await act(async () => { view = create(<EventsScreen />); });
  expect(content()).not.toContain('Hidden shell');
  expect(content()).toContain('Explorer Events');
  press('Bookmark Colombia conference');
  expect(view.root.findByType('EmbeddedAuth' as any).props.embedded).toBe(true);
  expect(mockSaveBookmarks).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  press('Close');
  expect(view.root.findAllByType('EmbeddedAuth' as any)).toHaveLength(0);
  press('Join the room for Colombia conference');
  expect(view.root.findByType('EmbeddedAuth' as any)).toBeDefined();
  expect(mockPush).not.toHaveBeenCalled();
});
it('keeps bookmark and room actions independent from card selection', async () => {
  const onSelectEvent = jest.fn();
  mockLoggedIn = true;
  mockSaveBookmarks.mockResolvedValue(undefined);
  await act(async () => { view = create(
    <Explorer
      events={[mockEvents[1]]}
      selectedEvent={null}
      onSelectEvent={onSelectEvent}
      onResetSelection={() => {}}
      isLoggedIn
      dbUserId="user-1"
      isGlobalExplorer
    />,
  ); });

  const bookmark = view.root.findAllByType(IconButton).find(
    node => node.props.label === 'Bookmark Colombia conference',
  );
  expect(bookmark).toBeDefined();
  expect(bookmark?.props.revealLabel).toBe(true);
  expect(bookmark?.props.preserveBaseStyleOnReveal).toBe(true);
  press('Bookmark Colombia conference');
  expect(onSelectEvent).not.toHaveBeenCalled();
  expect(mockSaveBookmarks).toHaveBeenCalledWith(['one']);

  press('Join the room for Colombia conference');
  expect(onSelectEvent).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/dashboard/event-chat',
    params: { eventId: 'one' },
  });
});
it('uses a spacious two-column grid for wide screens and keeps the compact grid for medium screens', async () => {
  mockLoggedIn = true;
  await act(async () => { view = create(
    <Explorer
      events={[mockEvents[1], mockEvents[2]]}
      selectedEvent={null}
      onSelectEvent={() => {}}
      onResetSelection={() => {}}
      isLoggedIn
      dbUserId="user-1"
      isGlobalExplorer
    />,
  ); });

  press('Grid layout');
  const hasStyle = (node: any, key: string, value: unknown) => {
    const entries = Array.isArray(node.props?.style) ? node.props.style : [node.props?.style];
    return entries.some((entry: any) => entry?.[key] === value);
  };
  expect(view.root.findAll((node) => hasStyle(node, 'minHeight', 322))).not.toHaveLength(0);

  setViewport(640);
  await act(async () => { view = create(
    <Explorer
      events={[mockEvents[1], mockEvents[2]]}
      selectedEvent={null}
      onSelectEvent={() => {}}
      onResetSelection={() => {}}
      isLoggedIn
      dbUserId="user-1"
      isGlobalExplorer
    />
  ); });
  press('Grid layout');
  expect(view.root.findAll((node) => hasStyle(node, 'minHeight', 224))).not.toHaveLength(0);
});
it('shows brand and event-family badges for summit and blockchain week cards', async () => {
  mockLoggedIn = true;
  await act(async () => { view = create(
    <Explorer
      events={[
        { ...mockEvents[1], id: 'colombia2026', title: 'Blockchain Summit Latam Colombia 2026' },
        { ...mockEvents[1], id: 'cbweek2026', title: 'Colombia Blockchain Week 2026' },
      ]}
      selectedEvent={null}
      onSelectEvent={() => {}}
      onResetSelection={() => {}}
      isLoggedIn
      dbUserId="user-1"
      isGlobalExplorer
    />
  ); });

  expect(content()).toContain('BSL');
  expect(content()).toContain('SUMMIT');
  expect(content()).toContain('CBW');
  expect(content()).toContain('CONFERENCE');
});
it('retains the shared search when dismissing registration and allows real public event navigation', async () => {
  await act(async () => { view = create(<EventsScreen />); });
  const input = view.root.findAllByType(TextInput)[0];
  act(() => input.props.onChangeText('France'));
  press('Wallet');
  press('Close');
  expect(view.root.findAllByType(TextInput)[0].props.value).toBe('France');
  press('Explore event');
  expect(mockSetParams).toHaveBeenCalledWith({ eventId: 'one' });
  expect(mockPush).not.toHaveBeenCalled();
});
it('shows real media and advances the showcase manually', async () => {
  await act(async () => { view = create(<EventsScreen />); });
  expect(content()).toContain('/real-event.webp');
  press('Next');
  press('Explore event');
  expect(mockSetParams).toHaveBeenCalledWith({ eventId: 'two' });
});
it('keeps remote event films out of the native public explorer', async () => {
  mockEvents[1].bannerSlides = [
    {
      id: 'event-film',
      media: { type: 'video', url: 'https://cdn.example/event-film.mp4' },
      title: 'Colombia conference',
    },
  ];
  await act(async () => { view = create(<EventsScreen />); });
  expect(view.root.findAllByType('EventVideo' as any)).toHaveLength(0);
  expect(content()).toContain('/real-event.webp');
});
it('plays organizer films on web while native keeps the poster fallback', async () => {
  mockEvents[1].bannerSlides = [
    {
      id: 'event-film',
      media: { type: 'video', url: 'https://cdn.example/event-film.mp4' },
      title: 'Colombia conference',
    },
  ];
  setPlatform('web');
  mockAnimationLevel = 'full';
  await act(async () => { view = create(<EventsScreen />); });
  expect(view.root.findAllByType('EventVideo' as any)).toHaveLength(1);
});
it('does not fabricate a showcase when the catalogue is empty', async () => {
  mockEvents = [];
  await act(async () => { view = create(<EventsScreen />); });
  expect(content()).not.toContain('IN THE SPOTLIGHT');
  expect(content()).toContain('No events');
});
it('allows authenticated visitors to enter their account without a guest form', async () => {
  mockLoggedIn = true;
  await act(async () => { view = create(<EventsScreen />); });
  press('Wallet');
  expect(mockPush).toHaveBeenCalledWith('/dashboard/wallet');
  expect(view.root.findAllByType('EmbeddedAuth' as any)).toHaveLength(0);
});
it('shows the sent-request stat for authenticated explorers', async () => {
  mockLoggedIn = true;
  await act(async () => { view = create(<EventsScreen />); });
  expect(content()).toContain('Requests');
  expect(content()).toContain('{count} sent');
});
it('retries the shared database session from the single reload control', async () => {
  mockLoggedIn = true;
  await act(async () => { view = create(<EventsScreen />); });
  jest.useFakeTimers();
  try {
    await act(async () => { view.root.findByProps({ testID: 'explorer-reload' }).props.onPress(); });
    expect(mockRetryDatabaseSession).toHaveBeenCalledTimes(1);
    // Let the minimum reload-feedback delay elapse so no timer outlives the test.
    await act(async () => { jest.runAllTimers(); });
  } finally {
    jest.useRealTimers();
  }
});
it('renders one reload control and no scroll-to-top button', async () => {
  mockLoggedIn = true;
  await act(async () => { view = create(<EventsScreen />); });
  expect(view.root.findAll((n) => n.props.testID === 'explorer-reload' && n.props.accessibilityLabel === 'Reload')).toHaveLength(1);
  expect(view.root.findAll((n) => n.props.testID === 'explorer-reload-passes' || n.props.testID === 'explorer-reload-events')).toHaveLength(0);
  expect(view.root.findAll((n) => n.props.accessibilityLabel === 'Scroll to top')).toHaveLength(0);
});
it('moves the quick-access rail for web wheel input', async () => {
  setPlatform('web');
  await act(async () => { view = create(<EventsScreen />); });
  const quickRail = view.root.findAll(
    node => node.props?.snapToInterval === 152 && typeof node.props?.onWheel === 'function',
  )[0];
  const container = { scrollLeft: 0 };
  act(() => quickRail.props.onWheel({ currentTarget: container, deltaY: 18 }));
  expect(container.scrollLeft).toBe(18);
});
it('renders the event-backed global hero and paginates the catalogue', async () => {
  mockHeroIndex = 1;
  const pagedEvents = Array.from({ length: 14 }, (_, index) => ({
    ...mockEvents[1],
    id: `event-${index}`,
    title: `Event ${index}`,
    eventStartDate: '2099-02-01',
  }));
  await act(async () => { view = create(
    <Explorer
      events={pagedEvents}
      selectedEvent={null}
      onSelectEvent={() => {}}
      onResetSelection={() => {}}
      isLoggedIn
      dbUserId="user-1"
      isGlobalExplorer
    />,
  ); });
  expect(content()).toContain('Event 0');
  const invoke = (label: string) => act(() => {
    const targets = view.root.findAll(
      node => node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function',
    );
    const target = targets[targets.length - 1];
    target.props.onPress();
  });
  invoke('Explore event');
  invoke('Next events page');
  invoke('Previous events page');
  const progress = view.root.findAll(
    node => typeof node.props?.getSegmentAccessibilityLabel === 'function',
  )[0];
  expect(progress.props.getSegmentAccessibilityLabel(1)).toContain('Event 0');
});
it('renders selected and tenant-owned hero media', async () => {
  const selected = {
    ...mockEvents[1],
    bannerSlides: [{
      id: 'hero',
      media: { type: 'video', url: 'https://cdn.example/hero.mp4' },
      cta: { label: 'Watch hero', url: '/events/two/home' },
    }],
    heroPoster: '/hero-poster.webp',
  };
  await act(async () => { view = create(
    <Explorer
      events={[selected]}
      selectedEvent={selected}
      onSelectEvent={() => {}}
      onResetSelection={() => {}}
      isLoggedIn
      dbUserId="user-1"
      isGlobalExplorer
    />,
  ); });
  expect(content()).toContain('Watch hero');
  const action = view.root.findAll(
    node => node.props?.accessibilityLabel === 'Watch hero' && typeof node.props?.onPress === 'function',
  ).at(-1)!;
  act(() => action.props.onPress());
  act(() => view.unmount());
  const tenant = { ...selected, id: 'hash-poker', title: 'Hash Poker' };
  await act(async () => { view = create(
    <Explorer
      events={[tenant]}
      selectedEvent={null}
      onSelectEvent={() => {}}
      onResetSelection={() => {}}
      isLoggedIn
      dbUserId="user-1"
      isGlobalExplorer={false}
    />,
  ); });
  expect(content()).toContain('Hash Poker');
});

it.each(['My passes', 'Wallet', 'Community'])('opens registration for guest %s without leaving Explorer', async label => {
  await act(async () => { view = create(<EventsScreen />); });
  press(label);
  expect(view.root.findByType('EmbeddedAuth' as any)).toBeDefined();
  expect(mockPush).not.toHaveBeenCalled();
});
it('loads the requested event context from the canonical eventId link', async () => {
  mockParams = { eventId: 'two' };
  await act(async () => { view = create(<EventsScreen />); });
  press('Explore event');
  expect(mockSetParams).toHaveBeenCalledWith({ eventId: 'two' });
});

it('offers the shared theme/language panel to guests without a sign-in redirect', async () => {
  await act(async () => { view = create(<EventsScreen />); });
  expect(view.root.findByType('QuickSettingsPanel' as any).props).toMatchObject({ inline: true, showSignIn: false, forceVisible: true });
});

it('keeps the guest header minimal without redundant account icons', async () => {
  await act(async () => { view = create(<EventsScreen />); });
  for (const label of ['Profile', 'My QR', 'Notifications']) {
    expect(view.root.findAllByType(Pressable).some(button => button.props.accessibilityLabel === label)).toBe(false);
  }
});

it('takes guests home from the full HASHPASS wordmark', async () => {
  await act(async () => { view = create(<EventsScreen />); });
  press('HASHPASS');
  expect(mockPush).toHaveBeenCalledWith('/home');
});

it('keeps the Join action readable on narrow phones without changing its accessible name', async () => {
  setViewport(375, 667);
  await act(async () => { view = create(<EventsScreen />); });
  expect(view.root.findAllByType(Pressable).some(button => button.props.accessibilityLabel === 'Join HASHPASS')).toBe(true);
  expect(view.root.findAllByType(Text).some(text => text.children.join('') === 'Join')).toBe(true);
});

it('explains guest mode on focus and dismisses the tooltip on blur without opening auth', async () => {
  await act(async () => { view = create(<EventsScreen />); });
  const badge = view.root.findAllByType(Pressable).find(item => item.props.accessibilityLabel === 'Guest mode')!;
  expect(badge.props.accessibilityHint).toContain('Register and download the app');
  expect(view.root.findAllByProps({ nativeID: 'guest-mode-description' })).toHaveLength(0);
  act(() => badge.props.onFocus());
  expect(view.root.findAllByProps({ nativeID: 'guest-mode-description' }).length).toBeGreaterThan(0);
  expect(badge.props.accessibilityState.expanded).toBe(true);
  act(() => badge.props.onBlur());
  expect(view.root.findAllByProps({ nativeID: 'guest-mode-description' })).toHaveLength(0);
  press('Guest mode');
  expect(badge.props.accessibilityState.expanded).toBe(true);
  expect(view.root.findAllByType('EmbeddedAuth' as any)).toHaveLength(0);
  expect(mockPush).not.toHaveBeenCalled();
});
it('switches the filter sheet tabs, gates Passes for guests and closes from the backdrop', async () => {
  mockLoggedIn = true;
  await act(async () => { view = create(<EventsScreen />); });
  press('Open filters');
  const tab = (name: string) => view.root.findAll((n) => n.props.accessibilityRole === 'tab' && n.findAllByType(Text).some((t: any) => t.props.children === name))[0];
  expect(tab('Events').props.accessibilityState.selected).toBe(true);
  act(() => tab('Passes').props.onPress());
  expect(tab('Passes').props.accessibilityState.selected).toBe(true);
  act(() => tab('Events').props.onPress());
  expect(tab('Events').props.accessibilityState.selected).toBe(true);
  // The dismiss layer covers the whole backdrop, so any outside tap closes.
  press('Close filters');
  const sheet = view.root.findAllByType(Modal).find((m) => m.findAll((n) => n.props.accessibilityLabel === 'Close filters').length > 0)!;
  expect(sheet.props.visible).toBe(false);
});
it('keeps guests on the Events filter tab when they pick Passes', async () => {
  mockLoggedIn = false;
  await act(async () => { view = create(<EventsScreen />); });
  press('Open filters');
  const tabs = () => view.root.findAll((n) => n.props.accessibilityRole === 'tab');
  const passes = tabs().find((n) => n.findAllByType(Text).some((t: any) => t.props.children === 'Passes'))!;
  act(() => passes.props.onPress());
  const events = tabs().find((n) => n.findAllByType(Text).some((t: any) => t.props.children === 'Events'))!;
  expect(events.props.accessibilityState.selected).toBe(true);
});
