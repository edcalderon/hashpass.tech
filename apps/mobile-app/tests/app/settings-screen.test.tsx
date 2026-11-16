import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Modal, Switch, Text, TouchableOpacity } from 'react-native';

const mockPush = jest.fn();
const mockToggleTheme = jest.fn();
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockAuth = { user: null as null | { id: string; email?: string }, dbUserId: 'db-u1' as string | null, signOut: jest.fn() };
const mockAuthenticatorStatus = jest.fn();
const mockPinLock = jest.fn();
const mockClearPinProblem = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }) }));
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn().mockResolvedValue(undefined),
}));
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
  return { useAuth: () => mockAuth };
});
jest.mock('../../hooks/usePin', () => ({
  usePin: () => ({ lock: mockPinLock, clearProblem: mockClearPinProblem }),
}));
jest.mock('../../lib/authenticator-client', () => ({
  authenticatorStatus: () => mockAuthenticatorStatus(),
}));
jest.mock('../../lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
  getRuntimeApiBaseUrl: () => 'https://api.test',
}));
jest.mock('../../lib/hashpass-web-url', () => ({ getHashpassWebOrigin: () => 'https://hashpass.test' }));
jest.mock('../../lib/event-path', () => ({ buildEventPath: () => '/events/x' }));
jest.mock('../../components/VersionDetailsModal', () => 'VersionDetailsModal');
jest.mock('../../components/security/PinFlow', () => 'PinFlow');
jest.mock('../../lib/native-google-signin', () => ({ clearNativeGoogleAccount: jest.fn() }));
jest.mock('../../lib/native-google-signin-config', () => ({ shouldUseNativeGoogleSignin: () => false }));
jest.mock('../../lib/auth/oauth/google-credentials', () => ({ resolveGoogleOAuthClientId: () => undefined }));
jest.mock('../../lib/calendar-subscription', () => ({
  buildCalendarFeedUrl: () => 'https://feed.test',
  buildCalendarProviderUrl: () => 'https://provider.test',
}));

import Settings from '../../app/(shared)/dashboard/settings';

describe('Settings screen', () => {
  beforeEach(() => {
    mockAuth.user = { id: 'u1', email: 'a@b.c' };
    mockAuth.dbUserId = 'db-u1';
    mockAuthenticatorStatus.mockReset().mockResolvedValue({ enabled: false });
    mockPinLock.mockReset();
    mockClearPinProblem.mockReset();
    mockApiGet.mockReset().mockImplementation(async (path: string) => path === '/marketing/preferences'
      ? { success: true, data: { success: true, subscribed: false, partnerSubscribed: false } }
      : { success: true, data: { success: true, data: { phones: [] } } });
    mockApiPost.mockReset().mockImplementation(async (_path: string, payload: { preference: string; subscribed: boolean }) => ({
      success: true,
      data: {
        success: true,
        subscribed: payload.preference === 'hashpass_updates' ? payload.subscribed : false,
        partnerSubscribed: payload.preference === 'partner_promotions' ? payload.subscribed : false,
      },
    }));
  });

  afterEach(() => jest.restoreAllMocks());

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

  it('offers optional authenticator setup from Settings without gating the Settings view', async () => {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Settings embedded />); });

    const securityRow = view.root.findAllByType(TouchableOpacity).find((row) =>
      row.findAllByType(Text).some((node) => [node.props.children].flat().join('') === 'Two-step verification'),
    );
    expect(securityRow).toBeTruthy();
    expect(securityRow!.findAllByType(Text).map((node) => [node.props.children].flat().join('')))
      .toContain('Optional · PIN-only access works. Set up an authenticator app for stronger security; email confirms setup.');

    await act(async () => { securityRow!.props.onPress(); });
    const setupModal = view.root.findAllByType(Modal).find((node) => node.props.visible);
    expect(setupModal).toBeTruthy();
    const pinFlow = view.root.findByType('PinFlow' as never);
    expect(pinFlow.props.scope).toBe('wallet:unlock');
    expect(pinFlow.props.intent).toBe('unlock');

    await act(async () => { pinFlow.props.onCancel(); });
    expect(mockPinLock).toHaveBeenCalledWith('wallet:unlock');
    expect(mockAuthenticatorStatus).toHaveBeenCalledTimes(2);
    act(() => view.unmount());
  });

  it('opens quick Settings shortcuts in the existing security, delete and about flows', async () => {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Settings embedded initialSettingsShortcut="about" />); });
    expect(view.root.findByType('VersionDetailsModal' as never).props.visible).toBe(true);
    act(() => view.unmount());

    await act(async () => { view = create(<Settings embedded initialSettingsShortcut="delete-account" />); });
    expect(JSON.stringify(view.toJSON())).toContain('This action is permanent and cannot be undone');
    act(() => view.unmount());

    await act(async () => {
      view = create(<Settings embedded initialSettingsShortcut="authenticator" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.root.findByType('PinFlow' as never).props.scope).toBe('wallet:unlock');
    expect(view.root.findAllByType(Modal).some((node) => node.props.visible)).toBe(true);
    act(() => view.unmount());
  });

  it('loads and updates the independent HASHPASS and partner email preferences', async () => {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Settings />); });

    const marketingSwitch = view.root.find(
      node => node.type === Switch && node.props.accessibilityLabel === 'HASHPASS updates',
    );
    expect(marketingSwitch.props.value).toBe(false);
    expect(marketingSwitch.props.disabled).toBe(false);

    await act(async () => { await marketingSwitch.props.onValueChange(true); });
    expect(mockApiPost).toHaveBeenLastCalledWith(
      '/marketing/preferences',
      expect.objectContaining({ preference: 'hashpass_updates', subscribed: true, requestId: expect.any(String) }),
      expect.objectContaining({ retries: 0 }),
    );

    const optedInSwitch = view.root.find(
      node => node.type === Switch && node.props.accessibilityLabel === 'HASHPASS updates',
    );
    expect(optedInSwitch.props.value).toBe(true);
    await act(async () => { await optedInSwitch.props.onValueChange(false); });
    expect(mockApiPost).toHaveBeenLastCalledWith(
      '/marketing/preferences',
      expect.objectContaining({ preference: 'hashpass_updates', subscribed: false, requestId: expect.any(String) }),
      expect.objectContaining({ retries: 0 }),
    );

    const partnerSwitch = view.root.find(
      node => node.type === Switch && node.props.accessibilityLabel === 'Partner offers',
    );
    expect(partnerSwitch.props.value).toBe(false);
    await act(async () => { await partnerSwitch.props.onValueChange(true); });
    expect(mockApiPost).toHaveBeenLastCalledWith(
      '/marketing/preferences',
      expect.objectContaining({ preference: 'partner_promotions', subscribed: true, requestId: expect.any(String) }),
      expect.objectContaining({ retries: 0 }),
    );

    act(() => view.unmount());
  });

  it('does not request marketing preferences before an account is linked', async () => {
    mockAuth.user = null;
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Settings />); });

    expect(mockApiGet).not.toHaveBeenCalledWith('/marketing/preferences', expect.anything());
    const marketingSwitch = view.root.find(
      node => node.type === Switch && node.props.accessibilityLabel === 'HASHPASS updates',
    );
    expect(marketingSwitch.props.disabled).toBe(true);
    act(() => view.unmount());
  });

  it('locks preference switches when the saved state cannot be loaded', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockApiGet.mockImplementation(async (path: string) => path === '/marketing/preferences'
      ? { success: true, data: { success: true, subscribed: 'unknown', partnerSubscribed: false } }
      : { success: true, data: { success: true, data: { phones: [] } } });
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Settings />); });

    const marketingSwitch = view.root.find(
      node => node.type === Switch && node.props.accessibilityLabel === 'HASHPASS updates',
    );
    expect(marketingSwitch.props.disabled).toBe(true);
    await act(async () => { await marketingSwitch.props.onValueChange(true); });
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    act(() => view.unmount());
  });

  it('keeps email switches unchanged when the server does not confirm a preference update', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockApiPost.mockResolvedValue({
      success: true,
      data: { success: true, subscribed: false, partnerSubscribed: false },
    });
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Settings />); });

    const marketingSwitch = view.root.find(
      node => node.type === Switch && node.props.accessibilityLabel === 'HASHPASS updates',
    );
    await act(async () => { await marketingSwitch.props.onValueChange(true); });

    const unchangedSwitch = view.root.find(
      node => node.type === Switch && node.props.accessibilityLabel === 'HASHPASS updates',
    );
    expect(unchangedSwitch.props.value).toBe(false);
    expect(warn).toHaveBeenCalledWith('[settings] Could not save email preferences:', expect.any(Error));
    act(() => view.unmount());
  });
});
