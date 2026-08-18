import React, { useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AuthQrApprovalCard } from '../../../components/AuthQrApprovalCard';
import { useAuth } from '../../../hooks/useAuth';

// Reached by scanning a HASHPASS Auth QR code (see lib/auth-qr.ts and the
// onRawScan wiring in _layout.tsx's QRScanner usages). The browser that
// showed the QR code is polling the API for this decision -- see
// packages/hashpass-links-api/src/routes/auth-qr.ts's approveChallenge().
// This route already lives behind the dashboard's own auth guard, but that
// guard only checks isLoggedIn -- it doesn't wait for the Supabase bridge
// session respondToLogin() actually needs (see USER_REGISTRY.md), so the
// card's own sessionStatus gate still applies here too.
export default function AuthQrApproveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isLoggedIn, isLoading: authLoading, dbUserId } = useAuth();
  const challengeId = typeof params.challengeId === 'string' ? params.challengeId : undefined;

  const sessionStatus = useMemo(() => {
    if (authLoading) return 'checking' as const;
    if (!isLoggedIn || !dbUserId) return 'signed_out' as const;
    return 'ready' as const;
  }, [authLoading, isLoggedIn, dbUserId]);

  // Confirmed live: every exit path here used to be a bare router.back(),
  // which silently no-ops if this screen has no navigation history to pop
  // -- e.g. a cold-started deep link straight from a QR scan intent, with
  // no prior screen on the stack. That left the user stuck on Approve/Deny
  // with no way out (Cancel, Deny, and Approve's own "Done" all landed
  // here). Falls back to a known-good destination (the dashboard) instead
  // of a dead no-op whenever there's nothing to go back to -- same
  // canGoBack()-guarded pattern already used by app/(shared)/privacy.tsx's
  // handleBackPress and app/auth/connect/index.tsx's closeOrLeave.
  const goHomeOrBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(shared)/dashboard/explore' as any);
  };

  return (
    <AuthQrApprovalCard
      challengeId={challengeId}
      sessionStatus={sessionStatus}
      onApproved={goHomeOrBack}
      onDenied={goHomeOrBack}
      onCancel={goHomeOrBack}
      onSignInRequired={() => router.replace('/auth' as any)}
      onInvalidAction={goHomeOrBack}
    />
  );
}
