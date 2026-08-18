/// <reference types="jest" />

import React from 'react';
import { Platform } from 'react-native';
import { HashpassError } from '@hashpass-tech/sdk';
import AuthConnectScreen from '../../app/auth/connect/index';
import { getCurrentLocale, setLocale } from '../../i18n/i18n';
import { LanguageProvider } from '../../providers/LanguageProvider';
import { I18nProvider } from '../../providers/I18nProvider';

const mockRefreshSession = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { refreshSession: (...args: unknown[]) => mockRefreshSession(...args) } },
}));

// Real async storage read, deliberately controllable per-test -- used by the
// LanguageProvider race test below to simulate it resolving AFTER this
// screen's own setLocaleOverride() call, the way it can on a real device.
const mockAsyncStorageGetItem = jest.fn().mockResolvedValue(null);
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]) => mockAsyncStorageGetItem(...args),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
}));

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

// Reached by clicking "Sign in using the web app" on hashpass.club's
// sign-in modal -- see apps/web-app/app/components/SignInModal.tsx's
// openWebApp().
describe('AuthConnectScreen', () => {
  let renderer: ReturnType<typeof create> | null = null;
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockParams = { challengeId: 'chal_123', source: 'web', ref: 'landing' };
    mockAuthState = { user: { id: 'better-auth-user-1' }, isLoggedIn: true, isLoading: false, dbUserId: 'db-user-1' };
    mockAsyncStorageGetItem.mockResolvedValue(null);
    mockRefreshSession.mockResolvedValue({ data: { session: { access_token: 'refreshed-token' } }, error: null });
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

  // Regression test for a real bug found live in production 2026-08-18:
  // clicking Deny landed on "Sign in required" instead of "Login denied" --
  // respondToLogin() 401'd even though the visitor had just been looking at
  // the Approve/Deny screen (which only renders once sessionStatus is
  // already 'ready'). Traced to a stale/not-yet-refreshed Supabase session
  // in this freshly-opened tab. Fixed with a refresh-and-retry-once wrapper
  // in AuthQrApprovalCard.tsx.
  it('retries once after refreshing a stale session instead of treating a transient 401 as signed out', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    mockRespondToLogin
      .mockRejectedValueOnce(new HashpassError('Authenticated HashPass app session required', { code: 'unauthorized', status: 401 }))
      .mockResolvedValueOnce({ status: 'denied' });
    renderer = await renderScreen();

    const denyButton = findByText(renderer.root, 'Deny').parent;
    await triggerPress(denyButton);

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockRespondToLogin).toHaveBeenCalledTimes(2);
    expect(mockRespondToLogin).toHaveBeenNthCalledWith(1, 'chal_123', 'deny');
    expect(mockRespondToLogin).toHaveBeenNthCalledWith(2, 'chal_123', 'deny');
    expect(findByText(renderer.root, 'Login denied')).toBeTruthy();
    expect(findByText(renderer.root, 'Sign in required')).toBeFalsy();
  });

  // Regression test for a real gap found live in production 2026-08-18:
  // clicking Cancel closed the tab but never told the server, so the
  // browser side (SignInModal.tsx's waitForLogin poll) had no way to know
  // and just kept waiting until the challenge's own server-side expiry,
  // minutes later. Fixed by treating an idle-state Cancel as an implicit
  // deny (best-effort, fire-and-forget) in the approval machine.
  it('cancelling from idle notifies the server as an implicit deny before leaving', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    mockRespondToLogin.mockResolvedValue({ status: 'denied' });
    renderer = await renderScreen();

    const cancelLink = findByText(renderer.root, 'Cancel').parent;
    await triggerPress(cancelLink);

    expect(mockRespondToLogin).toHaveBeenCalledWith('chal_123', 'deny');
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

  // Regression test for a real bug found live in production 2026-08-17:
  // LanguageProvider (mounted app-wide in app/_layout.tsx, not exercised by
  // the other tests above since they render AuthConnectScreen directly)
  // loads its own locale from AsyncStorage on every mount via a real async
  // read. If that resolves AFTER this screen's own locale request, it
  // silently overwrote the requested locale back to the device/saved one
  // with no coordination between the two -- confirmed live via
  // hashpass.tech/auth/connect?...&locale=es rendering fully in English.
  //
  // Mounts the FULL provider chain in app/_layout.tsx's actual nesting
  // order (LanguageProvider > I18nProvider > screen), not just
  // LanguageProvider -- an earlier version of this test only wrapped
  // LanguageProvider and missed a second, independent source of the same
  // clobber: I18nProviderInner (providers/I18nProvider.tsx) separately
  // forces the shared Lingui singleton to match LanguageProvider's own
  // context value whenever they differ, which fires the moment it mounts
  // (targetLocale starts at LanguageProvider's 'en' fallback before its
  // AsyncStorage read ever resolves) -- independently of the timing this
  // test controls below. Caught by code review; both call sites now check
  // isLocaleOverrideActive() before overwriting an active override.
  it('neither LanguageProvider nor I18nProviderInner overrides the requested locale', async () => {
    mockParams = { challengeId: 'chal_123', locale: 'es' };
    mockAsyncStorageGetItem.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(null), 500))
    );

    await act(async () => {
      renderer = create(
        <LanguageProvider>
          <I18nProvider>
            <AuthConnectScreen />
          </I18nProvider>
        </LanguageProvider>
      );
    });

    // Let I18nProvider's own initI18n() and the screen's setLocaleOverride()
    // (neither does real I/O) resolve and settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getCurrentLocale()).toBe('es');

    // Now let LanguageProvider's own delayed AsyncStorage read resolve --
    // before the fix, this (and/or I18nProviderInner reacting to
    // LanguageProvider's still-stale context value) silently reset the
    // locale back to 'en' (the mocked device locale) with no coordination
    // between either path and the requested override.
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getCurrentLocale()).toBe('es');
    expect(findByText(renderer.root, 'Inicia sesión con HASHPASS Auth')).toBeTruthy();
  });
});
