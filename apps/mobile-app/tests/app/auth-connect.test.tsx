/// <reference types="jest" />

import React from 'react';
import { Platform } from 'react-native';
import AuthConnectScreen from '../../app/auth/connect/index';
import { getCurrentLocale, setLocale } from '../../i18n/i18n';

const mockRespondToLogin = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = { challengeId: 'chal_123', source: 'web', ref: 'landing' };
let mockAuthState: { user: object | null; isLoggedIn: boolean; isLoading: boolean; dbUserId: string | null } = {
  user: { id: 'better-auth-user-1' },
  isLoggedIn: true,
  isLoading: false,
  dbUserId: 'db-user-1',
};

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: '#2563eb',
      background: { default: '#f8fafc' },
      divider: '#d1d5db',
      text: { primary: '#111827', secondary: '#4b5563', faint: '#9ca3af' },
      error: { main: '#dc2626' },
      success: { main: '#16a34a' },
    },
  }),
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../lib/hashpass-sdk', () => ({
  hashpassSdk: () => ({ authQr: { respondToLogin: (...args: unknown[]) => mockRespondToLogin(...args) } }),
}));

jest.mock('../../lib/hashpass-logo', () => ({
  getHashpassFullLogo: () => 1,
}));

jest.mock('../../lib/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const { act, create } = require('react-test-renderer');

const findByText = (root: any, text: string) => {
  const matches = root.findAll((node: any) => Array.isArray(node.children) && node.children.includes(text));
  return matches[0];
};

const renderScreen = async () => {
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<AuthConnectScreen />);
  });
  return renderer!;
};

const triggerPress = (node: any) => {
  const handler = node.props.onPress;
  if (typeof handler !== 'function') throw new Error('Expected a pressable node');
  return act(async () => {
    handler();
    await Promise.resolve();
    await Promise.resolve();
  });
};

// Reached by clicking "Open HASHPASS.TECH" on hashpass.club's sign-in modal
// -- see apps/web-app/app/components/SignInModal.tsx's openHashpassApp().
describe('AuthConnectScreen', () => {
  let renderer: ReturnType<typeof create> | null = null;
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockParams = { challengeId: 'chal_123', source: 'web', ref: 'landing' };
    mockAuthState = { user: { id: 'better-auth-user-1' }, isLoggedIn: true, isLoading: false, dbUserId: 'db-user-1' };
  });

  afterEach(async () => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
    }
    renderer = null;
    jest.useRealTimers();
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS });
    // i18n is a global singleton -- reset it so a locale left active by one
    // test (e.g. 'es' below) doesn't leak into unrelated suites that assert
    // on the English fallback text.
    await setLocale('en');
  });

  it('shows a checking state while auth is still loading', async () => {
    mockAuthState = { user: null, isLoggedIn: false, isLoading: true, dbUserId: null };
    renderer = await renderScreen();

    expect(findByText(renderer.root, 'Waiting for session…')).toBeTruthy();
    expect(findByText(renderer.root, 'Approve')).toBeFalsy();
  });

  it('redirects to /auth with returnTo (challengeId preserved) when signed out', async () => {
    mockAuthState = { user: null, isLoggedIn: false, isLoading: false, dbUserId: null };
    renderer = await renderScreen();

    expect(findByText(renderer.root, 'Sign in required')).toBeTruthy();

    const signInButton = findByText(renderer.root, 'Sign in now').parent;
    await triggerPress(signInButton);

    expect(mockReplace).toHaveBeenCalledWith(
      '/auth?returnTo=' + encodeURIComponent('/auth/connect?challengeId=chal_123&source=web&ref=landing')
    );
  });

  it('auto-redirects to /auth once the countdown reaches zero', async () => {
    mockAuthState = { user: null, isLoggedIn: false, isLoading: false, dbUserId: null };
    renderer = await renderScreen();

    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('/auth?returnTo='));
  });

  it('treats isLoggedIn=true without a bridged dbUserId as checking, then falls back to signed-out after the wait timeout', async () => {
    // isLoggedIn can flip true from Better Auth before the async Supabase
    // bridge session lands -- respondToLogin() needs that real session, not
    // just isLoggedIn. See hooks/auth-session-machine.ts's
    // SIGN_OUT_RESURRECTION_BARRIER_MS for the related sign-out-side race.
    mockAuthState = { user: { id: 'better-auth-user-1' }, isLoggedIn: true, isLoading: false, dbUserId: null };
    renderer = await renderScreen();

    expect(findByText(renderer.root, 'Waiting for session…')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(6000);
      await Promise.resolve();
    });

    expect(findByText(renderer.root, 'Sign in required')).toBeTruthy();
  });

  it('approves the login once a bridged session is ready, then navigates on native', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    mockRespondToLogin.mockResolvedValue({ status: 'approved' });
    renderer = await renderScreen();

    const approveButton = findByText(renderer.root, 'Approve').parent;
    await triggerPress(approveButton);

    expect(mockRespondToLogin).toHaveBeenCalledWith('chal_123', 'approve');
    expect(findByText(renderer.root, 'Login approved')).toBeTruthy();

    const doneButton = findByText(renderer.root, 'Done — Back to Club').parent;
    await triggerPress(doneButton);

    expect(mockReplace).toHaveBeenCalledWith('/(shared)/dashboard/explore');
  });

  it('shows a link-specific invalid message when challengeId is missing', async () => {
    mockParams = {};
    renderer = await renderScreen();

    expect(findByText(renderer.root, 'This link is missing information')).toBeTruthy();
  });

  // hashpass.club passes its visitor's current locale (SignInModal's
  // openWebApp()) so this screen matches -- rather than mocking i18n/i18n.ts
  // and asserting on call args, this renders against the real module so a
  // regression that silently no-ops setLocale() (e.g. a stale import path,
  // a dropped useEffect dependency) would actually fail this test.
  it('applies the locale param from the query string and renders translated text', async () => {
    mockParams = { challengeId: 'chal_123', locale: 'es' };
    renderer = await renderScreen();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getCurrentLocale()).toBe('es');
    expect(findByText(renderer.root, 'Inicia sesión con HASHPASS Auth')).toBeTruthy();
  });

  it('ignores an unrecognized locale param and falls back to English', async () => {
    mockParams = { challengeId: 'chal_123', locale: 'xx' };
    renderer = await renderScreen();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getCurrentLocale()).toBe('en');
    expect(findByText(renderer.root, 'Sign in with HASHPASS Auth')).toBeTruthy();
  });
});
