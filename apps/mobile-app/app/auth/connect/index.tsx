import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { AuthQrApprovalCard } from '../../../components/AuthQrApprovalCard';

// Bounds how long to wait for the Supabase bridge session (dbUserId) before
// treating the visitor as signed out -- the bridge can fail silently (see
// USER_REGISTRY.md), and waiting forever would leave the card's "Checking
// your session…" spinner on screen with no way out.
const DB_SESSION_WAIT_TIMEOUT_MS = 6000;

// Reached by clicking "Open HASHPASS.TECH" on hashpass.club's sign-in modal
// (apps/web-app/app/components/SignInModal.tsx's openHashpassApp()), opened
// in a new tab with the pending challenge's id in the query string. This is
// the desktop-without-a-phone path: instead of scanning the QR with the app,
// the browser that already has this app open (and, ideally, an existing
// session) approves the same challenge directly.
export default function AuthConnectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, isLoggedIn, isLoading: authLoading, dbUserId } = useAuth();

  const challengeId = typeof params.challengeId === 'string' ? params.challengeId : undefined;

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
      // "Open HASHPASS.TECH" button, which uses window.open()) -- browsers
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
      doneLabel="Done — Back to Club"
      invalidTitle="This link is missing information"
      invalidSubtitle="Go back to hashpass.club and click 'Open HASHPASS.TECH' again to get a fresh link."
      invalidActionLabel="Close"
      onInvalidAction={closeOrLeave}
    />
  );
}
