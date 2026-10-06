import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Animated, Platform, Text, TextInput, TouchableOpacity } from 'react-native';
import AuthScreen from '../../app/(shared)/auth';

const mockPost = jest.fn();
const mockSetSession = jest.fn();
const mockReplace = jest.fn();
let mockAuth: any = { user: null, isLoggedIn: false, isLoading: false };
let mockParams: Record<string, string> = {};
const mockFocus = jest.fn();
const mockT = (key: string, fallback: unknown) => typeof fallback === 'string' ? fallback : key;
jest.mock('../../lib/api-client', () => ({ apiClient: { post: (...args: unknown[]) => mockPost(...args) }, eventApiPath: jest.fn() }));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => mockAuth }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false, colors: { text: { primary: '#111', secondary: '#555' } } }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: mockT }), getCurrentLocale: () => 'en' }));
jest.mock('../../contexts/ToastContext', () => ({ useToastHelpers: () => ({ showError: jest.fn(), showSuccess: jest.fn() }) }));
jest.mock('../../contexts/AnimationLevelContext', () => ({ useAnimationLevel: () => ({ animationLevel: 'none' }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }), useLocalSearchParams: () => mockParams, Redirect: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@hashpass/auth', () => ({ authService: { getProviderName: () => 'supabase' }, getSupabaseMagicLinkCallbackPath: () => '/auth/callback', getSupabaseOAuthRedirectUrl: () => 'https://example.com/auth/callback' }));
jest.mock('../../config/supabase-profiles', () => ({ resolvePublicSupabaseConfig: () => ({}) }));
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { setSession: (...args: unknown[]) => mockSetSession(...args) } } }));
jest.mock('../../components/QuickSettingsPanel', () => () => null);
jest.mock('../../components/PrivacyTermsModal', () => () => null);
jest.mock('../../components/VersionDisplay', () => () => null);
jest.mock('../../components/ShaderAnimation', () => () => null);
jest.mock('../../lib/morph-icon', () => ({ MorphIcon: () => null }));
jest.mock('../../lib/vector-icons', () => ({ Ionicons: () => null }));
// Same convention as the SettingsIcons mocks in other tests that render
// auth.tsx/home.tsx incidentally (e.g. home.test.tsx, QuickSettingsPanel.test.tsx,
// events-index.test.tsx): the real react-native-svg-backed icon module breaks
// Jest's module graph here (SvgTouchableMixin reads an undefined `.Mixin` off a
// react-native internal that this test's mocks don't provide), so stub the icon
// component itself rather than let react-native-svg load for real.
jest.mock('../../components/icons/XIcon', () => ({ XIcon: () => null }));
jest.mock('../../lib/haptics', () => ({ hapticLight: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('lucide', () => ({ LoaderCircle: {}, Check: {} }));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));

describe('passwordless email reset', () => {
  let renderer: ReactTestRenderer;
  beforeEach(async () => {
    Platform.OS = 'ios';
    mockAuth = { user: null, isLoggedIn: false, isLoading: false };
    mockParams = {};
    mockReplace.mockReset();
    mockSetSession.mockReset().mockResolvedValue({ error: null });
    Object.assign(Animated, { Value: class { interpolate() { return 1; } setValue() {} stopAnimation() {} } });
    jest.useFakeTimers();
    mockPost.mockReset().mockResolvedValue({ success: true, data: { success: true } });
    mockFocus.mockClear();
    await act(async () => {
      renderer = create(<AuthScreen />, { createNodeMock: () => ({ focus: mockFocus }) });
    });
  });
  afterEach(() => { act(() => renderer.unmount()); jest.useRealTimers(); });

  const emailInput = () => renderer.root.findAllByType(TextInput).find((node) => node.props.placeholder === 'Enter your email')!;
  const button = (label: string) => renderer.root.findAllByType(TouchableOpacity).find((node) => node.findAllByType(Text).some((text) => text.props.children === label))!;
  const press = async (label: string) => { await act(async () => { button(label).props.onPress(); }); };

  it('offers the existing Google flow inside the modal and prevents duplicate pending requests', async () => {
    const signInWithOAuth = jest.fn().mockResolvedValue({ pending: true });
    mockAuth = { ...mockAuth, signInWithOAuth };
    await act(async () => renderer.update(<AuthScreen embedded />));
    await press('Sign in with Google');
    expect(signInWithOAuth).toHaveBeenCalledWith('google');
    expect(button('Opening Google sign-in...').props.disabled).toBe(true);
    await press('Opening Google sign-in...');
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('places Sign in with Apple below Google on iOS and starts only one Apple request', async () => {
    const signInWithOAuth = jest.fn().mockResolvedValue({ pending: true });
    mockAuth = { ...mockAuth, signInWithOAuth };
    await act(async () => renderer.update(<AuthScreen key="ios-apple" />));

    const oauthLabels = renderer.root.findAllByType(TouchableOpacity).map((node) =>
      node.findAllByType(Text).map((text) => text.props.children).find((label) =>
        label === 'Sign in with Google' || label === 'Sign in with Apple',
      ),
    );

    expect(oauthLabels.indexOf('Sign in with Apple')).toBeGreaterThan(
      oauthLabels.indexOf('Sign in with Google'),
    );

    await press('Sign in with Apple');
    expect(signInWithOAuth).toHaveBeenCalledWith('apple');
    expect(button('Opening Apple sign-in...').props.disabled).toBe(true);
    await press('Opening Apple sign-in...');
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it('shows Sign in with Apple on web and omits the iOS-only entry point on Android', async () => {
    const originalAddEventListener = window.addEventListener;
    const originalRemoveEventListener = window.removeEventListener;
    Object.defineProperty(window, 'addEventListener', { configurable: true, value: jest.fn() });
    Object.defineProperty(window, 'removeEventListener', { configurable: true, value: jest.fn() });

    try {
      Platform.OS = 'web';
      await act(async () => renderer.update(<AuthScreen key="web-apple" />));
      expect(button('Sign in with Apple')).toBeDefined();

      Platform.OS = 'android';
      await act(async () => renderer.update(<AuthScreen key="android-no-apple" />));
      expect(button('Sign in with Apple')).toBeUndefined();
    } finally {
      Object.defineProperty(window, 'addEventListener', { configurable: true, value: originalAddEventListener });
      Object.defineProperty(window, 'removeEventListener', { configurable: true, value: originalRemoveEventListener });
    }
  });

  it('preserves a web OAuth return path before opening Google sign-in', async () => {
    Platform.OS = 'web';
    const returnTo = '/mcp/login?client_id=chatgpt&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcallback%3Fsource%3Done%26mode%3Dmcp&sig=signed-value';
    mockParams = { returnTo };
    const signInWithOAuth = jest.fn().mockResolvedValue({ pending: true });
    mockAuth = { ...mockAuth, signInWithOAuth };
    const originalLocalStorage = window.localStorage;
    const localStorage = {
      clear: jest.fn(),
      getItem: jest.fn(),
      key: jest.fn(),
      length: 0,
      removeItem: jest.fn(),
      setItem: jest.fn(),
    };
    const originalAddEventListener = window.addEventListener;
    const originalRemoveEventListener = window.removeEventListener;
    Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorage });
    Object.defineProperty(window, 'addEventListener', { configurable: true, value: jest.fn() });
    Object.defineProperty(window, 'removeEventListener', { configurable: true, value: jest.fn() });

    await act(async () => renderer.update(<AuthScreen key="mcp-login" />));
    await press('Sign in with Google');

    expect(localStorage.setItem).toHaveBeenCalledWith('oauth_return_url', returnTo);
    act(() => renderer.unmount());
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage });
    Object.defineProperty(window, 'addEventListener', { configurable: true, value: originalAddEventListener });
    Object.defineProperty(window, 'removeEventListener', { configurable: true, value: originalRemoveEventListener });
  });

  it('offers only Better Auth Google sign-in during an MCP authorization continuation', async () => {
    mockParams = {
      returnTo: '/mcp/login?client_id=chatgpt&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcallback&sig=signed-value',
    };

    await act(async () => renderer.update(<AuthScreen key="mcp-passwordless-guard" />));

    expect(button('Magic Link')).toBeUndefined();
    expect(button('OTP Code')).toBeUndefined();
    expect(button('Send Magic Link')).toBeUndefined();
    expect(button('Send Code')).toBeUndefined();
    expect(button('Sign in with Google')).toBeDefined();
    expect(
      renderer.root.findAllByType(Text).some(
        (node) => node.props.children === 'Secure app authorization',
      ),
    ).toBe(true);
  });

  it.each(['Magic Link', 'OTP Code'])('resets %s confirmation and permits a different address', async (method) => {
    await press(method);
    act(() => emailInput().props.onChangeText('first@example.com'));
    const sendLabel = method === 'Magic Link' ? 'Send Magic Link' : 'Send Code';
    await press(sendLabel);
    expect(button('Use another email')).toBeDefined();
    if (method === 'OTP Code') {
      const firstDigit = renderer.root.findAllByType(TextInput).find((node) => node.props.maxLength === 6)!;
      act(() => firstDigit.props.onChangeText('1'));
    }
    await press('Use another email');
    act(() => jest.advanceTimersByTime(100));
    expect(emailInput().props.value).toBe('');
    expect(button('Use another email')).toBeUndefined();
    expect(button(sendLabel)).toBeDefined();
    act(() => emailInput().props.onChangeText('second@example.com'));
    await press(sendLabel);
    expect(mockPost.mock.calls.at(-1)[1].email).toBe('second@example.com');
    if (method === 'OTP Code') {
      const digits = renderer.root.findAllByType(TextInput).filter((node) => node.props.maxLength === 1 || node.props.maxLength === 6);
      expect(digits.map((node) => node.props.value)).toEqual(['', '', '', '', '', '']);
    }
  });
  it('registers or signs in inside the guest dialog using the existing OTP service without navigation', async () => {
    const onAuthenticated = jest.fn();
    await act(async () => { renderer.update(<AuthScreen key="embedded" embedded onAuthenticated={onAuthenticated} />); });
    expect(button('Magic Link')).toBeUndefined();
    expect(button('Sign in with Google')).toBeDefined();
    act(() => emailInput().props.onChangeText('guest@example.com'));
    await press('Send Code');
    expect(mockPost.mock.calls.at(-1)[0]).toBe('/auth/otp');
    const firstDigit = renderer.root.findAllByType(TextInput).find(node => node.props.maxLength === 6)!;
    mockPost.mockResolvedValueOnce({ success: true, data: { success: true, token_hash: 'test-hash', session: { access_token: 'test-access', refresh_token: 'test-refresh' } } });
    await act(async () => { firstDigit.props.onChangeText('123456'); });
    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(onAuthenticated).not.toHaveBeenCalled();
    mockAuth = { user: { id: 'test-user' }, isLoggedIn: true, isLoading: false };
    await act(async () => { renderer.update(<AuthScreen key="embedded" embedded onAuthenticated={onAuthenticated} />); });
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

});
