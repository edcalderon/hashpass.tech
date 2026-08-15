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

  return (
    <AuthQrApprovalCard
      challengeId={challengeId}
      sessionStatus={sessionStatus}
      onApproved={() => router.back()}
      onDenied={() => router.back()}
      onCancel={() => router.back()}
      onSignInRequired={() => router.replace('/auth' as any)}
      onInvalidAction={() => router.back()}
    />
  );
}
