import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { AuthQrApprovalCard } from '../../../components/AuthQrApprovalCard';
import { setLocaleOverride, useTranslation } from '../../../i18n/i18n';

// Bounds how long to wait for the Supabase bridge session (dbUserId) before
// treating the visitor as signed out -- the bridge can fail silently (see
// USER_REGISTRY.md), and waiting forever would leave the card's "Checking
// your session…" spinner on screen with no way out.
const DB_SESSION_WAIT_TIMEOUT_MS = 6000;

// Reached by clicking "Sign in using the web app" on hashpass.club's sign-in
// modal (apps/web-app/app/components/SignInModal.tsx's openWebApp()), opened
// in a new tab with the pending challenge's id in the query string. This is
// the desktop-without-a-phone path: instead of scanning the QR with the app,
// the browser that already has this app open (and, ideally, an existing
// session) approves the same challenge directly.
export default function AuthConnectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, isLoggedIn, isLoading: authLoading, dbUserId } = useAuth();
  const { t } = useTranslation('auth.qrApproval');

  const challengeId = typeof params.challengeId === 'string' ? params.challengeId : undefined;
  const requestedLocale = typeof params.locale === 'string' ? params.locale : undefined;
  // setLocale mutates Lingui's singleton. Keep a local revision so this
  // screen always renders again after that mutation, rather than relying on
  // an unrelated provider render or the polling fallback in useTranslation.
  const [, setLocaleRevision] = useState(0);

  // hashpass.club passes its visitor's current locale in the query string
  // (SignInModal's openWebApp()) so this screen matches the language they
  // were already using there instead of falling back to device locale --
  // setLocale() itself validates against the known locale set and falls
  // back to 'en' for anything unrecognized, so no validation needed here.
  // Uses setLocaleOverride() rather than plain setLocale(): LanguageProvider
  // (mounted app-wide in app/_layout.tsx) loads its own locale from
  // AsyncStorage on every mount via a real async read, and if that resolves
  // AFTER this effect it silently overwrites the requested locale back to
  // the device/saved one -- setLocaleOverride() flags this request so that
  // provider's own load defers instead of racing it (see i18n.ts).
  useEffect(() => {
    if (!requestedLocale) return;

    let mounted = true;
    setLocaleOverride(requestedLocale)
      .catch(() => {})
      .finally(() => {
        if (mounted) setLocaleRevision((revision) => revision + 1);
      });

    return () => {
      mounted = false;
    };
  }, [requestedLocale]);

  const returnTo = useMemo(() => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string') search.set(key, value);
    });
    const query = search.toString();
    return query ? `/auth/connect?${query}` : '/auth/connect';
  }, [params]);

  const [dbSessionWaitTimedOut, setDbSessionWaitTimedOut] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn || dbUserId) return;
    const timer = setTimeout(() => setDbSessionWaitTimedOut(true), DB_SESSION_WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoggedIn, dbUserId]);

  const goToSignIn = () => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(`/auth?returnTo=${encodeURIComponent(returnTo)}` as any);
  };

  const closeOrLeave = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Only actually closes if this tab was opened by script (true for the
      // "Sign in using the web app" button, which uses window.open()) -- browsers
      // silently no-op window.close() on tabs the user navigated to
      // directly, which is an acceptable, harmless fallback here.
      window.close();
      return;
    }
    router.replace('/(shared)/dashboard/explore' as any);
  };

  const sessionStatus = useMemo<'checking' | 'ready' | 'signed_out'>(() => {
    if (authLoading) return 'checking';
    if (!isLoggedIn || !user) return 'signed_out';
    if (!dbUserId) return dbSessionWaitTimedOut ? 'signed_out' : 'checking';
    return 'ready';
  }, [authLoading, isLoggedIn, user, dbUserId, dbSessionWaitTimedOut]);

  return (
    <AuthQrApprovalCard
      challengeId={challengeId}
      sessionStatus={sessionStatus}
      onApproved={closeOrLeave}
      onDenied={closeOrLeave}
      onCancel={closeOrLeave}
      onSignInRequired={goToSignIn}
      doneLabel={t('connectDoneLabel', 'Done — Back to Club')}
      invalidTitle={t('connectInvalidTitle', 'This link is missing information')}
      invalidSubtitle={t(
        'connectInvalidSubtitle',
        'Go back to hashpass.club and click "Sign in using the web app" again to get a fresh link.'
      )}
      invalidActionLabel={t('close', 'Close')}
      onInvalidAction={closeOrLeave}
    />
  );
}
