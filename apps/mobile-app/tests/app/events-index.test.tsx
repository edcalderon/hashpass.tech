import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable, TextInput, TouchableOpacity } from 'react-native';
const mockPush = jest.fn(); const mockSetParams = jest.fn(); let mockParams: any = {}; const mockSaveBookmarks = jest.fn(); let mockEvents: any[]; let mockLoggedIn = false;
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, setParams: mockSetParams }), useLocalSearchParams: () => mockParams }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: true, colors: { primary: '#22d3ee', divider: '#333', background: { default: '#111', paper: '#19191f' }, text: { primary: '#fff', secondary: '#aaa', disabled: '#777' } } }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('../../contexts/AnimationLevelContext', () => ({ useAnimationLevel: () => ({ animationLevel: 'none' }) }));
jest.mock('../../contexts/EventContext', () => ({ useEvent: () => ({}) }));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ isLoggedIn: mockLoggedIn, dbUserId: null }) }));
jest.mock('../../components/icons/SettingsIcons', () => ({ LogInIcon: () => null }));
jest.mock('../../components/QuickSettingsPanel', () => 'QuickSettingsPanel');
jest.mock('../../app/(shared)/auth', () => 'EmbeddedAuth');
jest.mock('../../lib/vector-icons', () => ({ NativeSafeIcon: () => null }));
jest.mock('../../components/PassesDisplay', () => () => null);
jest.mock('../../components/banner/SliderProgressBar', () => ({ SliderProgressBar: () => null }));
jest.mock('../../lib/hooks/useAutoAdvanceProgress', () => ({ useAutoAdvanceProgress: () => ({ activeIndex: 0, progress: { value: 0 }, pause: jest.fn(), resume: jest.fn(), goTo: jest.fn() }) }));
jest.mock('../../lib/event-chat', () => ({ loadEventChatPresence: jest.fn(), getEventChatAvatarUrl: jest.fn() }));
jest.mock('../../lib/explorer-bookmarks', () => ({ loadExplorerBookmarks: async () => [], saveExplorerBookmarks: (...args: unknown[]) => mockSaveBookmarks(...args) }));
jest.mock('../../lib/event-detector', () => ({ getAvailableEvents: () => mockEvents, getEventQuickAccessItems: () => [] }));
jest.mock('../../lib/event-branding', () => ({ resolveEventImageSource: (uri: string) => ({ uri }) }));
jest.mock('../../components/EventBannerBackgroundVideo.native', () => 'EventVideo');
jest.mock('../../components/EventBannerBackgroundVideo', () => 'EventVideo', { virtual: true });
import EventsScreen from '../../components/events/GuestExplorer';
let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
const press = (label: string) => act(() => [...view.root.findAllByType(Pressable), ...view.root.findAllByType(TouchableOpacity)].find(button => button.props.accessibilityLabel === label)!.props.onPress());
beforeEach(() => { mockPush.mockReset(); mockSetParams.mockReset(); mockParams = {}; mockSaveBookmarks.mockReset(); mockLoggedIn = false; mockEvents = [
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
