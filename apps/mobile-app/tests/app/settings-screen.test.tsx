import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Switch, Text, TouchableOpacity } from 'react-native';

const mockPush = jest.fn();
const mockToggleTheme = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }) }));
jest.mock('expo-haptics', () => ({}));
jest.mock('@lingui/macro', () => ({ t: ({ message }: { message: string }) => message }));
jest.mock('@lingui/core', () => ({ i18n: { _: (d: any) => (typeof d === 'string' ? d : d?.message ?? d?.id), activate: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), getAllKeys: jest.fn(async () => []),
}));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('../../hooks/useTheme', () => {
  const theme = {
    isDark: false,
    toggleTheme: () => mockToggleTheme(),
    colors: {
      primary: '#a00', primaryContrastText: '#fff', divider: '#ddd',
      background: { paper: '#fafafa', default: '#fff' }, text: { primary: '#111', secondary: '#555' },
    },
  };
  return { useTheme: () => theme };
});
jest.mock('../../providers/LanguageProvider', () => ({ useLanguage: () => ({ locale: 'en', setLocale: jest.fn() }) }));
jest.mock('../../providers/AnimationProvider', () => ({
  useAnimations: () => ({ animationsEnabled: true, setAnimationsEnabled: jest.fn() }),
}));
jest.mock('../../providers/DiscoveryScopeProvider', () => ({
  useDiscoveryScope: () => ({ showAllTenants: false, setShowAllTenants: jest.fn(), isEditable: true }),
}));
jest.mock('@contexts/ToastContext', () => ({
  useToastHelpers: () => ({ showSuccess: jest.fn(), showInfo: jest.fn(), showError: jest.fn() }),
}));
jest.mock('../../lib/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialIcons: 'MaterialIcons' }));
jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key) }),
}));
jest.mock('../../hooks/useTutorialPreferences', () => ({
  useTutorialPreferences: () => ({
    resetTutorial: jest.fn(), resetAllTutorials: jest.fn(), mainTutorialCompleted: false, networkingTutorialCompleted: false,
  }),
}));
jest.mock('../../hooks/useAuth', () => {
  const auth = { user: { id: 'u1', email: 'a@b.c' }, signOut: jest.fn() };
  return { useAuth: () => auth };
});
jest.mock('../../lib/api-client', () => ({ apiClient: {}, getRuntimeApiBaseUrl: () => 'https://api.test' }));
jest.mock('../../lib/hashpass-web-url', () => ({ getHashpassWebOrigin: () => 'https://hashpass.test' }));
jest.mock('../../lib/event-path', () => ({ buildEventPath: () => '/events/x' }));
jest.mock('../../components/VersionDetailsModal', () => 'VersionDetailsModal');
jest.mock('../../lib/native-google-signin', () => ({ clearNativeGoogleAccount: jest.fn() }));
jest.mock('../../lib/native-google-signin-config', () => ({ shouldUseNativeGoogleSignin: () => false }));
jest.mock('../../lib/auth/oauth/google-credentials', () => ({ resolveGoogleOAuthClientId: () => undefined }));
jest.mock('../../lib/calendar-subscription', () => ({
  buildCalendarFeedUrl: () => 'https://feed.test',
  buildCalendarProviderUrl: () => 'https://provider.test',
}));

import Settings from '../../app/(shared)/dashboard/settings';

describe('Settings screen', () => {
  it('groups rows into cards under section headings and keeps the controls working', () => {
    let view!: ReactTestRenderer;
    act(() => { view = create(<Settings />); });
    const labels = view.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
    ['App Settings', 'Tutorials', 'Security', 'About'].forEach(heading => expect(labels).toContain(heading));
    // Dark mode switch is wired through the grouped row.
    const darkSwitch = view.root.findAll(n => n.type === Switch && n.props.value === false && typeof n.props.onValueChange === 'function')[0];
    act(() => { darkSwitch.props.onValueChange(true); });
    expect(mockToggleTheme).toHaveBeenCalled();
    const rows = view.root.findAllByType(TouchableOpacity);
    expect(rows.length).toBeGreaterThan(5);
    act(() => view.unmount());
  });
});
