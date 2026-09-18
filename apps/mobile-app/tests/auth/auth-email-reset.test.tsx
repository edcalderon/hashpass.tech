import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Animated, Platform, Text, TextInput, TouchableOpacity } from 'react-native';
import AuthScreen from '../../app/(shared)/auth';

const mockPost = jest.fn();
const mockFocus = jest.fn();
const mockT = (key: string, fallback: unknown) => typeof fallback === 'string' ? fallback : key;
jest.mock('../../lib/api-client', () => ({ apiClient: { post: (...args: unknown[]) => mockPost(...args) }, eventApiPath: jest.fn() }));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: null, isLoggedIn: false, isLoading: false }) }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false, colors: { text: { primary: '#111', secondary: '#555' } } }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: mockT }), getCurrentLocale: () => 'en' }));
jest.mock('../../contexts/ToastContext', () => ({ useToastHelpers: () => ({ showError: jest.fn(), showSuccess: jest.fn() }) }));
jest.mock('../../contexts/AnimationLevelContext', () => ({ useAnimationLevel: () => ({ animationLevel: 'none' }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({}), useLocalSearchParams: () => ({}), Redirect: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@hashpass/auth', () => ({ authService: { getProviderName: () => 'supabase' }, getSupabaseMagicLinkCallbackPath: () => '/auth/callback', getSupabaseOAuthRedirectUrl: () => 'https://example.com/auth/callback' }));
jest.mock('../../config/supabase-profiles', () => ({ resolvePublicSupabaseConfig: () => ({}) }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../components/QuickSettingsPanel', () => () => null);
jest.mock('../../components/PrivacyTermsModal', () => () => null);
jest.mock('../../components/VersionDisplay', () => () => null);
jest.mock('../../components/ShaderAnimation', () => () => null);
jest.mock('../../lib/morph-icon', () => ({ MorphIcon: () => null }));
jest.mock('../../lib/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../lib/haptics', () => ({ hapticLight: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('lucide', () => ({ LoaderCircle: {}, Check: {} }));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));

describe('passwordless email reset', () => {
  let renderer: ReactTestRenderer;
  beforeEach(async () => {
    Platform.OS = 'ios';
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
});
