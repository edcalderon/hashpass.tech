import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AuthCallback from '../../app/(shared)/auth/callback';

const createElement = Reflect.get(React, 'createElement');
const mockReplace = jest.fn();
const mockHandleOAuthCallback = jest.fn();
const mockShowSuccess = jest.fn();

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ handleOAuthCallback: mockHandleOAuthCallback }),
}));

jest.mock('@contexts/ToastContext', () => ({
  useToastHelpers: () => ({ showSuccess: mockShowSuccess }),
}));

jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

jest.mock('lucide-react-native', () => ({ Check: 'Check', AlertCircle: 'AlertCircle' }));
jest.mock('../../components/HashpassLoader', () => () => null);

jest.mock('@hashpass/auth', () => ({
  authService: { getProviderName: jest.fn(() => 'directus') },
  SUPABASE_OAUTH_CALLBACK_PATH: '/auth/callback',
  SUPABASE_OAUTH_NATIVE_SCHEME: 'hashpass',
}));

jest.mock('../../lib/supabase', () => ({
  createSessionFromUrl: jest.fn(),
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('../../config/supabase-profiles', () => ({
  resolvePublicSupabaseConfig: () => ({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
  }),
}));

jest.mock('../../lib/auth/recent-auth', () => ({ markRecentAuthSuccess: jest.fn() }));
jest.mock('../../lib/auth/return-to', () => ({
  normalizeSafeReturnToPath: (path: string) => path,
}));

describe('AuthCallback social OAuth routing', () => {
  let renderer: ReactTestRenderer | null = null;
  const originalWindow = global.window;

  afterEach(() => {
    if (renderer) {
      act(() => renderer?.unmount());
      renderer = null;
    }
    Object.defineProperty(global, 'window', { configurable: true, value: originalWindow });
    jest.clearAllMocks();
  });

  it('rejects a stale X marker instead of falling through to the tenant OAuth provider', async () => {
    const localStorage = {
      getItem: jest.fn((key: string) => {
        if (key === 'auth_signin_method') return 'twitter_oauth';
        return null;
      }),
      removeItem: jest.fn(),
    };
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'https://hashpass.tech/auth/callback',
          hash: '',
          pathname: '/auth/callback',
          origin: 'https://hashpass.tech',
        },
        localStorage,
        sessionStorage: { getItem: jest.fn(() => null), removeItem: jest.fn(), setItem: jest.fn() },
      },
    });

    await act(async () => {
      renderer = create(createElement(AuthCallback));
      await Promise.resolve();
    });

    expect(mockHandleOAuthCallback).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('error=oauth_failed'),
    );
    expect(localStorage.removeItem).toHaveBeenCalledWith('auth_signin_method');
  });
});
